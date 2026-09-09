import type { DataSource, Repository } from 'typeorm';

import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { KnockoutBracketSnapshotEntity } from './entities/knockout-bracket-snapshot.entity';
import { KnockoutBracketPlanEntity } from './entities/knockout-bracket-plan.entity';
import { KnockoutBracketSnapshotStatus } from './enums/knockout-bracket-snapshot-status.enum';
import { KnockoutBracketEngine } from './knockout-bracket.engine';
import { KnockoutBracketService } from './knockout-bracket.service';

describe('KnockoutBracketService', () => {
  it('hashes JSON data independently of PostgreSQL jsonb key order', () => {
    const service = new KnockoutBracketService(
      {} as Repository<KnockoutBracketSnapshotEntity>,
      {} as DataSource,
      new KnockoutBracketEngine(),
    ) as unknown as {
      stableSerialize(value: unknown): string;
    };

    expect(
      service.stableSerialize({
        seedingInput: {
          manualPairs: [{ home: 1, away: 2 }],
          drawResults: [],
        },
        qualifiers: [{ id: 1, comparison: { points: 10, wins: 3 } }],
      }),
    ).toBe(
      service.stableSerialize({
        qualifiers: [{ comparison: { wins: 3, points: 10 }, id: 1 }],
        seedingInput: {
          drawResults: [],
          manualPairs: [{ away: 2, home: 1 }],
        },
      }),
    );
  });

  it('fills final and third-place participants after a semi-final', async () => {
    const semi = {
      id: 1,
      tournamentId: 10,
      bracketSnapshotId: 50,
      bracketPosition: 'SF-1',
      homeTeamId: 101,
      awayTeamId: 102,
      homeScore: 2,
      awayScore: 1,
      status: MatchStatus.FINISHED,
      resultOfficialAt: new Date(),
      winnerTeamId: 101,
      loserTeamId: 102,
    } as MatchEntity;
    const final = {
      id: 3,
      bracketSnapshotId: 50,
      bracketPosition: 'FINAL',
      homeParticipantSource: {
        type: 'match_outcome',
        bracketPosition: 'SF-1',
        outcome: 'winner',
      },
      status: MatchStatus.SCHEDULED,
    } as MatchEntity;
    const thirdPlace = {
      id: 4,
      bracketSnapshotId: 50,
      bracketPosition: 'THIRD_PLACE',
      homeParticipantSource: {
        type: 'match_outcome',
        bracketPosition: 'SF-1',
        outcome: 'loser',
      },
      status: MatchStatus.SCHEDULED,
    } as MatchEntity;
    const save = jest.fn((value: MatchEntity) => Promise.resolve(value));
    const matchRepository = {
      findOne: jest.fn(() => Promise.resolve(semi)),
      find: jest.fn(() => Promise.resolve([semi, final, thirdPlace])),
      save,
    } as unknown as Repository<MatchEntity>;
    const manager = {
      getRepository: jest.fn(() => matchRepository),
    };
    const dataSource = {
      transaction: jest.fn(
        (
          _isolation: string,
          callback: (value: typeof manager) => Promise<MatchEntity | undefined>,
        ) => callback(manager),
      ),
    } as unknown as DataSource;
    const service = new KnockoutBracketService(
      {} as Repository<KnockoutBracketSnapshotEntity>,
      dataSource,
      new KnockoutBracketEngine(),
    );

    await service.advanceAutomatically(10, 1);

    expect(semi).toEqual(
      expect.objectContaining({ winnerTeamId: 101, loserTeamId: 102 }),
    );
    expect(final.homeTeamId).toBe(101);
    expect(thirdPlace.homeTeamId).toBe(102);
    expect(save).toHaveBeenCalledWith(final);
    expect(save).toHaveBeenCalledWith(thirdPlace);
  });

  it('does not advance an automatically finished match before its result is official', async () => {
    const semi = {
      id: 1,
      tournamentId: 10,
      bracketSnapshotId: 50,
      bracketPosition: 'SF-1',
      homeTeamId: 101,
      awayTeamId: 102,
      status: MatchStatus.FINISHED,
      winnerTeamId: 101,
    } as MatchEntity;
    const find = jest.fn();
    const save = jest.fn();
    const matchRepository = {
      findOne: jest.fn(() => Promise.resolve(semi)),
      find,
      save,
    } as unknown as Repository<MatchEntity>;
    const manager = { getRepository: jest.fn(() => matchRepository) };
    const dataSource = {
      transaction: jest.fn(
        (
          _isolation: string,
          callback: (value: typeof manager) => Promise<MatchEntity | undefined>,
        ) => callback(manager),
      ),
    } as unknown as DataSource;
    const service = new KnockoutBracketService(
      {} as Repository<KnockoutBracketSnapshotEntity>,
      dataSource,
      new KnockoutBracketEngine(),
    );

    await expect(service.advanceAutomatically(10, 1)).resolves.toBeUndefined();
    expect(find).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('treats repeated confirmation of the same snapshot as idempotent', async () => {
    const snapshot = {
      id: 60,
      tournamentId: 10,
      status: KnockoutBracketSnapshotStatus.CONFIRMED,
      plans: [],
    } as unknown as KnockoutBracketSnapshotEntity;
    const snapshotFindOne = jest.fn(() => Promise.resolve(snapshot));
    const snapshotRepository = {
      findOne: snapshotFindOne,
    } as unknown as Repository<KnockoutBracketSnapshotEntity>;
    const matchSave = jest.fn();
    const planFind = jest.fn(() => Promise.resolve(snapshot.plans));
    const planRepository = {
      find: planFind,
    } as unknown as Repository<KnockoutBracketPlanEntity>;
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === KnockoutBracketSnapshotEntity) {
          return snapshotRepository;
        }
        if (entity === KnockoutBracketPlanEntity) return planRepository;
        return { save: matchSave } as unknown as Repository<MatchEntity>;
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        (
          _isolation: string,
          callback: (
            value: typeof manager,
          ) => Promise<KnockoutBracketSnapshotEntity>,
        ) => callback(manager),
      ),
    } as unknown as DataSource;
    const service = new KnockoutBracketService(
      snapshotRepository,
      dataSource,
      new KnockoutBracketEngine(),
    );

    const confirmed = await service.confirm(10, 60, {}, 1);

    expect(confirmed).toBe(snapshot);
    expect(matchSave).not.toHaveBeenCalled();
    expect(snapshotFindOne).toHaveBeenCalledWith({
      where: { id: 60, tournamentId: 10 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(planFind).toHaveBeenCalledWith({
      where: { snapshotId: 60 },
      order: { order: 'ASC' },
    });
  });
});
