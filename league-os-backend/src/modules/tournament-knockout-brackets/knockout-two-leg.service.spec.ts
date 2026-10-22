import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { KnockoutBracketSnapshotEntity } from './entities/knockout-bracket-snapshot.entity';
import { KnockoutBracketEngine } from './knockout-bracket.engine';
import { KnockoutBracketService } from './knockout-bracket.service';

function fixture() {
  const first = {
    id: 1,
    tournamentId: 10,
    bracketSnapshotId: 50,
    bracketPosition: 'QF-1:L1',
    homeTeamId: 101,
    awayTeamId: 102,
    homeScore: 3,
    awayScore: 0,
    winnerTeamId: 101,
    status: MatchStatus.FINISHED,
    resultOfficialAt: new Date(),
  } as MatchEntity;
  const second = {
    ...first,
    id: 2,
    bracketPosition: 'QF-1:L2',
    homeTeamId: 102,
    awayTeamId: 101,
    homeScore: 2,
    awayScore: 0,
    winnerTeamId: 102,
  } as MatchEntity;
  const next = {
    id: 3,
    bracketSnapshotId: 50,
    bracketPosition: 'SF-1:L1',
    status: MatchStatus.SCHEDULED,
    homeParticipantSource: {
      type: 'match_outcome',
      bracketPosition: 'QF-1',
      outcome: 'winner',
    },
  } as MatchEntity;
  const nextReturn = {
    id: 4,
    bracketSnapshotId: 50,
    bracketPosition: 'SF-1:L2',
    status: MatchStatus.SCHEDULED,
    awayParticipantSource: next.homeParticipantSource,
  } as MatchEntity;
  const all = [first, second, next, nextReturn];
  const save = jest.fn((value: MatchEntity) => Promise.resolve(value));
  const repo = {
    findOne: jest.fn(({ where }: { where: { id: number } }) =>
      Promise.resolve(where.id === 1 ? first : second),
    ),
    findOneBy: jest.fn(() => Promise.resolve(first)),
    findBy: jest.fn(() => Promise.resolve(all)),
    find: jest.fn(({ where }: { where: { bracketPosition?: unknown } }) =>
      Promise.resolve(where.bracketPosition ? [first, second] : all),
    ),
    save,
  };
  const manager = {
    getRepository: (type: unknown) =>
      type === MatchEntity
        ? repo
        : { findOne: () => Promise.resolve({ id: 50 }) },
  } as unknown as EntityManager;
  const data = {
    manager,
    transaction: (_: unknown, run: (m: EntityManager) => unknown) =>
      Promise.resolve(run(manager)),
  } as DataSource;
  return {
    first,
    second,
    next,
    nextReturn,
    manager,
    save,
    service: new KnockoutBracketService(
      {} as Repository<KnockoutBracketSnapshotEntity>,
      data,
      new KnockoutBracketEngine(),
    ),
  };
}

describe('Two-legged knockout progression', () => {
  it('advances the aggregate winner into both fixtures of the next round, not the return-match winner', async () => {
    const f = fixture();
    await f.service.advanceAutomatically(10, 2);
    expect(f.next.homeTeamId).toBe(101);
    expect(f.nextReturn.awayTeamId).toBe(101);
    expect(f.second.winnerTeamId).toBe(102);
  });

  it('does not advance after only the first official leg', async () => {
    const f = fixture();
    f.second.status = MatchStatus.SCHEDULED;
    f.second.resultOfficialAt = undefined;
    await expect(
      f.service.advanceAutomatically(10, 1),
    ).resolves.toBeUndefined();
    expect(f.save).not.toHaveBeenCalled();
    await expect(f.service.advance(10, 1, 101)).rejects.toThrow(
      ConflictException,
    );
  });

  it('uses return-leg penalties only after a tied aggregate', async () => {
    const f = fixture();
    f.second.homeScore = 3;
    f.second.penaltyHomeScore = 5;
    f.second.penaltyAwayScore = 4;
    await f.service.advanceAutomatically(10, 2);
    expect(f.next.homeTeamId).toBe(102);
    await expect(f.service.advance(10, 2, 101)).rejects.toThrow(
      ConflictException,
    );
  });

  it('does not advance a tied aggregate with no shootout', async () => {
    const f = fixture();
    f.second.homeScore = 3;
    await expect(
      f.service.advanceAutomatically(10, 2),
    ).resolves.toBeUndefined();
    expect(f.save).not.toHaveBeenCalled();
  });

  it('provides the first-leg score in the return fixture team order', async () => {
    const f = fixture();
    expect((await f.service.getTieContext(f.second))?.previousScore).toEqual({
      home: 0,
      away: 3,
    });
  });

  it('rejects a return result before the first one is official', async () => {
    const f = fixture();
    f.first.resultOfficialAt = undefined;
    await expect(f.service.assertTieResultWritable(f.second)).rejects.toThrow(
      ConflictException,
    );
  });

  it('protects the first-leg result once the return fixture has started', async () => {
    const f = fixture();
    f.second.status = MatchStatus.LIVE;
    await expect(f.service.assertTieResultWritable(f.first)).rejects.toThrow(
      ConflictException,
    );
  });

  it('protects downstream participants after the next round starts', async () => {
    const f = fixture();
    f.next.status = MatchStatus.LIVE;
    f.next.homeTeamId = 101;
    f.first.homeScore = 0;
    await expect(f.service.advanceAutomatically(10, 2)).rejects.toThrow(
      ConflictException,
    );
    await expect(f.service.assertTieResultWritable(f.second)).rejects.toThrow(
      ConflictException,
    );
  });
});
