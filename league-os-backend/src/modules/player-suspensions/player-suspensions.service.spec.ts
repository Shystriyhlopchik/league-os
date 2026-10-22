import type { Repository } from 'typeorm';

import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { MatchEntity } from '../matches/entities/match.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import type { TournamentRulesConfig } from '../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { createYardLeagueRules } from '../tournaments/validation/yard-league-rules.fixture';
import { DisciplineEngine } from './discipline.engine';
import { PlayerSuspensionEntity } from './entities/player-suspension.entity';
import { PlayerSuspensionReason } from './enums/player-suspension-reason.enum';
import { PlayerSuspensionStatus } from './enums/player-suspension-status.enum';
import { PlayerSuspensionsService } from './player-suspensions.service';

interface TestRepositories {
  suspensions: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  matches: { findOne: jest.Mock };
  events: { createQueryBuilder: jest.Mock };
  stages: { find: jest.Mock };
  tournaments: { findOne: jest.Mock };
  versions: { findOne: jest.Mock };
}

const stages = [
  { id: 1, tournamentId: 10, key: 'groups', order: 1 },
  { id: 2, tournamentId: 10, key: 'playoff', order: 2 },
] as TournamentStageEntity[];

function createService(params?: {
  activeSuspensions?: PlayerSuspensionEntity[];
  yellowCards?: number;
  match?: MatchEntity;
  config?: TournamentRulesConfig;
}) {
  const stored = params?.activeSuspensions ?? [];
  const save = jest.fn(
    (
      value: PlayerSuspensionEntity | PlayerSuspensionEntity[],
    ): Promise<PlayerSuspensionEntity | PlayerSuspensionEntity[]> => {
      if (Array.isArray(value)) return Promise.resolve(value);
      if (!stored.includes(value)) {
        stored.push(value);
      }
      return Promise.resolve(value);
    },
  );
  const findSuspensions = (options: {
    where?: { reason?: PlayerSuspensionReason };
  }): Promise<PlayerSuspensionEntity[]> => {
    const reason = options.where?.reason;
    return Promise.resolve(
      reason ? stored.filter((item) => item.reason === reason) : stored,
    );
  };
  const findSuspension = (options: {
    where: { id?: number };
  }): Promise<PlayerSuspensionEntity | undefined> =>
    Promise.resolve(stored.find((item) => item.id === options.where.id));
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(params?.yellowCards ?? 0),
  };
  const repositories: TestRepositories = {
    suspensions: {
      find: jest.fn(findSuspensions),
      findOne: jest.fn(findSuspension),
      create: jest.fn((value: PlayerSuspensionEntity) => value),
      save,
    },
    matches: {
      findOne: jest.fn(() => Promise.resolve(params?.match)),
    },
    events: {
      createQueryBuilder: jest.fn(() => queryBuilder),
    },
    stages: {
      find: jest.fn(() => Promise.resolve(stages)),
    },
    tournaments: {
      findOne: jest.fn(() =>
        Promise.resolve({ id: 10, activeRuleVersionId: 30 }),
      ),
    },
    versions: {
      findOne: jest.fn(() =>
        Promise.resolve({
          id: 30,
          tournamentId: 10,
          config: params?.config ?? createYardLeagueRules(),
        }),
      ),
    },
  };
  const service = new PlayerSuspensionsService(
    repositories.suspensions as unknown as Repository<PlayerSuspensionEntity>,
    repositories.matches as unknown as Repository<MatchEntity>,
    repositories.events as unknown as Repository<MatchEventEntity>,
    repositories.stages as unknown as Repository<TournamentStageEntity>,
    repositories.tournaments as unknown as Repository<TournamentEntity>,
    repositories.versions as unknown as Repository<TournamentRuleVersionEntity>,
    new DisciplineEngine(),
  );
  return { service, repositories, stored };
}

describe('PlayerSuspensionsService', () => {
  it('creates a suspension even when no future match exists', async () => {
    const match = {
      id: 100,
      tournamentId: 10,
      stageId: 1,
      effectiveRuleVersionId: 30,
    } as MatchEntity;
    const { service, stored, repositories } = createService({
      match,
      yellowCards: 3,
    });

    await service.applyCardEvent({
      match,
      teamId: 20,
      playerId: 300,
      eventType: MatchEventType.YELLOW_CARD,
    });

    expect(stored).toEqual([
      expect.objectContaining({
        stageId: 1,
        playerId: 300,
        matchesRequired: 1,
        matchesServed: 0,
        status: PlayerSuspensionStatus.ACTIVE,
        sourceMatchId: 100,
      }),
    ]);
    expect(repositories.matches.findOne).not.toHaveBeenCalled();
  });

  it.each([
    [
      MatchEventType.SECOND_YELLOW_CARD,
      PlayerSuspensionReason.SECOND_YELLOW_CARD,
    ],
    [MatchEventType.RED_CARD, PlayerSuspensionReason.DIRECT_RED],
  ])(
    'creates the configured one-match suspension for %s',
    async (eventType, reason) => {
      const match = {
        id: 110,
        tournamentId: 10,
        stageId: 1,
        effectiveRuleVersionId: 30,
      } as MatchEntity;
      const { service, stored } = createService({ match });

      await service.applyCardEvent({
        match,
        teamId: 20,
        playerId: 310,
        eventType,
      });

      expect(stored).toEqual([
        expect.objectContaining({
          reason,
          matchesRequired: 1,
          status: PlayerSuspensionStatus.ACTIVE,
        }),
      ]);
    },
  );

  it('serves the suspension on the next actually completed match after a reschedule', async () => {
    const suspension = {
      id: 1,
      tournamentId: 10,
      stageId: 1,
      playerId: 300,
      teamId: 20,
      reason: PlayerSuspensionReason.ACCUMULATED_YELLOWS,
      matchesRequired: 1,
      matchesServed: 0,
      status: PlayerSuspensionStatus.ACTIVE,
      sourceMatchId: 100,
    } as PlayerSuspensionEntity;
    const completedMatch = {
      id: 150,
      tournamentId: 10,
      stageId: 1,
      homeTeamId: 20,
      awayTeamId: 21,
      resultOfficialAt: new Date(),
      matchDatetime: new Date('2030-01-20'),
    } as MatchEntity;
    const { service } = createService({
      activeSuspensions: [suspension],
      match: completedMatch,
    });

    await service.serveSuspensionsForMatch(completedMatch.id);

    expect(suspension.matchesServed).toBe(1);
    expect(suspension.status).toBe(PlayerSuspensionStatus.SERVED);
    expect(suspension.servedAt).toBeInstanceOf(Date);
  });

  it('cancels a pending suspension when the next stage forbids transfer', async () => {
    const suspension = {
      id: 1,
      tournamentId: 10,
      stageId: 1,
      playerId: 300,
      teamId: 20,
      reason: PlayerSuspensionReason.SECOND_YELLOW_CARD,
      matchesRequired: 1,
      matchesServed: 0,
      status: PlayerSuspensionStatus.ACTIVE,
      sourceMatchId: 100,
    } as PlayerSuspensionEntity;
    const playoffMatch = {
      id: 200,
      tournamentId: 10,
      stageId: 2,
      homeTeamId: 20,
      awayTeamId: 21,
      effectiveRuleVersionId: 30,
    } as MatchEntity;
    const { service } = createService({
      activeSuspensions: [suspension],
      match: playoffMatch,
    });

    const eligibility = await service.getEligibilityForMatch(
      playoffMatch,
      20,
      [300],
    );

    expect(suspension.status).toBe(PlayerSuspensionStatus.CANCELLED);
    expect(suspension.cancelledAt).toBeInstanceOf(Date);
    expect(eligibility.get(300)?.suspension).toBeUndefined();
  });

  it('moves a pending suspension to the next stage when transfer is enabled', async () => {
    const suspension = {
      id: 2,
      tournamentId: 10,
      stageId: 1,
      playerId: 301,
      teamId: 20,
      reason: PlayerSuspensionReason.DIRECT_RED,
      matchesRequired: 1,
      matchesServed: 0,
      status: PlayerSuspensionStatus.ACTIVE,
      sourceMatchId: 101,
    } as PlayerSuspensionEntity;
    const playoffMatch = {
      id: 201,
      tournamentId: 10,
      stageId: 2,
      homeTeamId: 20,
      awayTeamId: 21,
      effectiveRuleVersionId: 30,
    } as MatchEntity;
    const config = createYardLeagueRules();
    config.stages[0].discipline.stageTransition.carryPendingSuspensions = true;
    const { service } = createService({
      activeSuspensions: [suspension],
      match: playoffMatch,
      config,
    });

    const eligibility = await service.getEligibilityForMatch(
      playoffMatch,
      20,
      [301],
    );

    expect(suspension.stageId).toBe(2);
    expect(suspension.status).toBe(PlayerSuspensionStatus.ACTIVE);
    expect(eligibility.get(301)?.suspension).toBe(suspension);
  });

  it('manually extends an active suspension and records the decision', async () => {
    const suspension = {
      id: 5,
      tournamentId: 10,
      stageId: 1,
      playerId: 300,
      teamId: 20,
      reason: PlayerSuspensionReason.DIRECT_RED,
      matchesRequired: 1,
      matchesServed: 0,
      status: PlayerSuspensionStatus.ACTIVE,
      sourceMatchId: 100,
    } as PlayerSuspensionEntity;
    const sourceMatch = {
      id: 100,
      tournamentId: 10,
      stageId: 1,
      effectiveRuleVersionId: 30,
    } as MatchEntity;
    const { service } = createService({
      activeSuspensions: [suspension],
      match: sourceMatch,
    });

    const updated = await service.extend(10, 5, 2, 900);

    expect(updated.matchesRequired).toBe(3);
    expect(updated.manualDecisionId).toBe(900);
  });
});
