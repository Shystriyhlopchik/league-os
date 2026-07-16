import type { DataSource, Repository } from 'typeorm';

import { MatchEntity } from '../../matches/entities/match.entity';
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageStatus } from '../../tournament-stages/enums/tournament-stage-status.enum';
import { TournamentStageType } from '../../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../../tournament-teams/enums/tournament-team-status.enum';
import { TournamentEntity } from '../entities/tournaments.entity';
import { GROUP_STAGE_SCHEDULE_RESET_CONFIRMATION } from '../dto/generate-group-stage-schedule.dto';
import { GroupAssignmentStrategyService } from './group-assignment-strategy.service';
import { RoundRobinGenerator } from './round-robin-generator';
import { TournamentGroupSchedulingService } from './tournament-group-scheduling.service';

describe('TournamentGroupSchedulingService', () => {
  const tournament = {
    id: 10,
    activeRuleVersionId: 3,
  } as TournamentEntity;
  const stage = {
    id: 20,
    tournamentId: 10,
    tournament,
    type: TournamentStageType.GROUP_STAGE,
    status: TournamentStageStatus.PENDING,
  } as TournamentStageEntity;
  const groups = [1, 2, 3].map(
    (id) =>
      ({
        id,
        stageId: 20,
        key: String.fromCharCode(64 + id),
        order: id,
        capacity: 5,
      }) as TournamentGroupEntity,
  );
  const teams = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    tournamentId: 10,
    teamId: 101 + index,
    seedNumber: index + 1,
    status: TournamentTeamStatus.ACTIVE,
  })) as TournamentTeamEntity[];
  const participants = teams.map(
    (team, index) =>
      ({
        id: index + 1,
        stageId: 20,
        tournamentTeamId: team.id,
        tournamentTeam: team,
        groupId: groups[Math.floor(index / 5)].id,
      }) as TournamentStageParticipantEntity,
  );

  const stageRepository = {
    findOne: jest.fn(async () => stage),
  } as unknown as Repository<TournamentStageEntity>;
  const tournamentRepository = {
    findOne: jest.fn(async () => tournament),
  } as unknown as Repository<TournamentEntity>;
  const groupRepository = {
    find: jest.fn(async () => groups),
  } as unknown as Repository<TournamentGroupEntity>;
  const participantRepository = {
    find: jest.fn(async () => participants),
  } as unknown as Repository<TournamentStageParticipantEntity>;
  const teamRepository = {
    find: jest.fn(async () => teams),
  } as unknown as Repository<TournamentTeamEntity>;
  const storedMatches: MatchEntity[] = [];
  const matchRepository = {
    find: jest.fn(async () => storedMatches),
    create: jest.fn((value) => value),
    save: jest.fn(async (values: MatchEntity[]) => {
      values.forEach((value, index) => {
        value.id = storedMatches.length + index + 1;
      });
      storedMatches.push(...values);
      return values;
    }),
    update: jest.fn(),
  } as unknown as Repository<MatchEntity>;
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === TournamentEntity) return tournamentRepository;
      if (entity === TournamentStageEntity) return stageRepository;
      if (entity === TournamentGroupEntity) return groupRepository;
      if (entity === TournamentStageParticipantEntity)
        return participantRepository;
      if (entity === TournamentTeamEntity) return teamRepository;
      return matchRepository;
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  } as unknown as DataSource;
  const service = new TournamentGroupSchedulingService(
    tournamentRepository,
    stageRepository,
    groupRepository,
    participantRepository,
    teamRepository,
    matchRepository,
    dataSource,
    new GroupAssignmentStrategyService(),
    new RoundRobinGenerator(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    storedMatches.splice(0);
    stage.status = TournamentStageStatus.PENDING;
  });

  it('previews exactly 30 matches for three groups of five', async () => {
    const preview = await service.previewSchedule(10, 20, { legs: 1 });

    expect(preview.totalMatches).toBe(30);
    expect(preview.groups.map((group) => group.matchCount)).toEqual([
      10, 10, 10,
    ]);
    expect(preview.groups.every((group) => group.rounds.length === 5)).toBe(
      true,
    );
  });

  it('does not insert duplicates when generation is requested twice', async () => {
    const first = await service.generateSchedule(10, 20, { legs: 1 });
    const second = await service.generateSchedule(10, 20, { legs: 1 });

    expect(first.createdMatches).toBe(30);
    expect(first.idempotent).toBe(false);
    expect(second.createdMatches).toBe(0);
    expect(second.idempotent).toBe(true);
    expect(storedMatches).toHaveLength(30);
    expect(matchRepository.save).toHaveBeenCalledTimes(1);
    expect(
      storedMatches.every((match) => !match.matchDatetime && !match.venueId),
    ).toBe(true);
  });

  it('requires explicit reset confirmation after the stage has started', async () => {
    await service.generateSchedule(10, 20, { legs: 1 });
    stage.status = TournamentStageStatus.ACTIVE;

    await expect(service.generateSchedule(10, 20, { legs: 2 })).rejects.toThrow(
      'confirm RESET_GROUP_STAGE_SCHEDULE',
    );

    const regenerated = await service.generateSchedule(10, 20, {
      legs: 2,
      resetConfirmation: GROUP_STAGE_SCHEDULE_RESET_CONFIRMATION,
    });

    expect(regenerated.createdMatches).toBe(60);
    expect(matchRepository.update).toHaveBeenCalledTimes(1);
  });
});
