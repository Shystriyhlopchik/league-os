import type { DataSource, Repository } from 'typeorm';

import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { TeamEntity } from '../teams/entities/team.entity';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageParticipantStatus } from '../tournament-stage-participants/enums/tournament-stage-participant-status.enum';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { createYardLeagueRules } from '../tournaments/validation/yard-league-rules.fixture';
import { StandingEntity } from './entities/standing.entity';
import { RuleDrivenStandingsEngine } from './rule-driven-standings.engine';
import { StandingsService } from './standings.service';

describe('StandingsService rule-driven scope', () => {
  const teams = [1, 2, 3].map(
    (id) => ({ id, name: `Team ${id}`, logoUrl: undefined }) as TeamEntity,
  );
  const tournamentTeams = teams.map(
    (team, index) =>
      ({ id: index + 11, teamId: team.id, team }) as TournamentTeamEntity,
  );
  const participants = tournamentTeams.map(
    (tournamentTeam, index) =>
      ({
        id: index + 21,
        stageId: 10,
        groupId: 100,
        tournamentTeamId: tournamentTeam.id,
        tournamentTeam,
        status: TournamentStageParticipantStatus.ACTIVE,
      }) as TournamentStageParticipantEntity,
  );
  const stage = {
    id: 10,
    key: 'groups',
    tournamentId: 1,
    type: TournamentStageType.GROUP_STAGE,
  } as TournamentStageEntity;
  const group = { id: 100, stageId: 10 } as TournamentGroupEntity;
  const tournament = {
    id: 1,
    activeRuleVersionId: 7,
  } as TournamentEntity;
  const ruleVersion = {
    id: 7,
    tournamentId: 1,
    config: createYardLeagueRules(),
  } as TournamentRuleVersionEntity;
  const matchRows = [
    {
      id: 1,
      tournamentId: 1,
      stageId: 10,
      groupId: 100,
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 1,
      awayScore: 0,
      status: MatchStatus.FINISHED,
    },
    {
      id: 2,
      tournamentId: 1,
      stageId: 10,
      groupId: 200,
      homeTeamId: 2,
      awayTeamId: 3,
      homeScore: 9,
      awayScore: 0,
      status: MatchStatus.FINISHED,
    },
    {
      id: 3,
      tournamentId: 1,
      stageId: 99,
      groupId: undefined,
      homeTeamId: 1,
      awayTeamId: 3,
      homeScore: 0,
      awayScore: 5,
      status: MatchStatus.FINISHED,
    },
    {
      id: 4,
      tournamentId: 1,
      stageId: 10,
      groupId: 100,
      homeTeamId: 2,
      awayTeamId: 3,
      homeScore: 0,
      awayScore: 7,
      status: MatchStatus.SCHEDULED,
    },
  ] as MatchEntity[];

  const standingsRepository = {
    find: jest.fn(async () => []),
    delete: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  } as unknown as Repository<StandingEntity>;
  const matchesRepository = {
    find: jest.fn(async () => matchRows),
  } as unknown as Repository<MatchEntity>;
  const stageRepository = {
    find: jest.fn(),
    findOne: jest.fn(async () => stage),
  } as unknown as Repository<TournamentStageEntity>;
  const groupRepository = {
    find: jest.fn(),
    findOne: jest.fn(async () => group),
  } as unknown as Repository<TournamentGroupEntity>;
  const participantRepository = {
    find: jest.fn(async () => participants),
  } as unknown as Repository<TournamentStageParticipantEntity>;
  const tournamentTeamRepository = {
    find: jest.fn(),
  } as unknown as Repository<TournamentTeamEntity>;
  const tournamentRepository = {
    findOne: jest.fn(async () => tournament),
  } as unknown as Repository<TournamentEntity>;
  const ruleVersionRepository = {
    findOne: jest.fn(async () => ruleVersion),
  } as unknown as Repository<TournamentRuleVersionEntity>;
  const eventRepository = {
    find: jest.fn(async () => []),
  } as unknown as Repository<MatchEventEntity>;
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === StandingEntity) return standingsRepository;
      if (entity === MatchEntity) return matchesRepository;
      if (entity === MatchEventEntity) return eventRepository;
      if (entity === TournamentStageEntity) return stageRepository;
      if (entity === TournamentGroupEntity) return groupRepository;
      if (entity === TournamentStageParticipantEntity)
        return participantRepository;
      if (entity === TournamentEntity) return tournamentRepository;
      return ruleVersionRepository;
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (_isolation, callback) => callback(manager)),
  } as unknown as DataSource;
  const service = new StandingsService(
    standingsRepository,
    matchesRepository,
    stageRepository,
    groupRepository,
    participantRepository,
    tournamentTeamRepository,
    dataSource,
    new RuleDrivenStandingsEngine(),
  );

  beforeEach(() => jest.clearAllMocks());

  it('uses only finished matches from the requested stage and group', async () => {
    const result = await service.recalculateStage(1, 10, 100);

    expect(result[0].team.id).toBe(1);
    expect(new Set(result.map((row) => row.team.id))).toEqual(
      new Set([1, 2, 3]),
    );
    expect(result.find((row) => row.team.id === 1)).toEqual(
      expect.objectContaining({ played: 1, wins: 1, points: 3 }),
    );
    expect(result.find((row) => row.team.id === 2)).toEqual(
      expect.objectContaining({ played: 1, losses: 1, points: 0 }),
    );
    expect(result.find((row) => row.team.id === 3)).toEqual(
      expect.objectContaining({ played: 0, points: 0 }),
    );
    expect(dataSource.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
  });
});
