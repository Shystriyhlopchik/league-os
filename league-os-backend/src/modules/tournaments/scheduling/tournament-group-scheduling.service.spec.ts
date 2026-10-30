import type { DataSource, Repository } from 'typeorm';

import { MatchEntity } from '../../matches/entities/match.entity';
import { MatchStatus } from '../../matches/enums/match-status.enum';
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageStatus } from '../../tournament-stages/enums/tournament-stage-status.enum';
import { TournamentStageType } from '../../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../../tournament-teams/enums/tournament-team-status.enum';
import { TournamentEntity } from '../entities/tournaments.entity';
import { TournamentLifecycleStatus } from '../enums/tournament-lifecycle-status.enum';
import { GROUP_STAGE_SCHEDULE_RESET_CONFIRMATION } from '../dto/generate-group-stage-schedule.dto';
import { GroupAssignmentStrategyService } from './group-assignment-strategy.service';
import { RoundRobinGenerator } from './round-robin-generator';
import { TournamentGroupSchedulingService } from './tournament-group-scheduling.service';
import { VenueEntity } from '../../venues/entities/venue.entity';
import { PreviewScheduleImportDto } from '../dto/import-schedule.dto';

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
  const venueRepository = { find: jest.fn(async () => [{ id: 5, name: 'Спартак' }]) };
  const matchRepository = {
    find: jest.fn(async () =>
      storedMatches.filter((m) => m.status !== MatchStatus.CANCELLED),
    ),
    create: jest.fn((value) => value),
    save: jest.fn(async (values: MatchEntity[]) => {
      values.forEach((value) => {
        if (!value.id) {
          value.id = storedMatches.length + 1;
          storedMatches.push(value);
        }
      });
      return values;
    }),
    update: jest.fn(async (where, values) => {
      if (typeof where.id === 'number') {
        const match = storedMatches.find((m) => m.id === where.id);
        if (match) Object.assign(match, values);
      }
      if (typeof where.stageId === 'number') storedMatches.filter(m => m.stageId === where.stageId && m.status !== MatchStatus.CANCELLED).forEach(m => Object.assign(m, values));
    }),
  } as unknown as Repository<MatchEntity>;
  const manager = {
    exists: jest.fn(async () => false),
    getRepository: jest.fn((entity) => {
      if (entity === VenueEntity) return venueRepository;
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
    manager,
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
    tournament.lifecycleStatus = TournamentLifecycleStatus.PUBLISHED;
    tournament.registrationRequired = false;
    tournament.registrationStatus = 'closed';
    stage.configuration = { type: 'group_stage', legs: 1 };
    manager.exists.mockResolvedValue(false);
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
  const manualMatch = {
    groupId: 1,
    roundNumber: 1,
    homeTeamId: 101,
    awayTeamId: 102,
  };
  it('creates a manual pairing without generating the entire calendar', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    const match = await service.saveManualMatch(10, 20, manualMatch);
    expect(storedMatches).toHaveLength(1);
    expect(match).toMatchObject({
      ...manualMatch,
      stageId: 20,
      tournamentId: 10,
      status: MatchStatus.SCHEDULED,
    });
    expect(tournamentRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
  it('rejects self-play and teams outside the selected group', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    await expect(
      service.saveManualMatch(10, 20, { ...manualMatch, awayTeamId: 101 }),
    ).rejects.toThrow('сама с собой');
    await expect(
      service.saveManualMatch(10, 20, { ...manualMatch, awayTeamId: 106 }),
    ).rejects.toThrow('одной группы');
    await expect(
      service.saveManualMatch(10, 20, { ...manualMatch, groupId: 99 }),
    ).rejects.toThrow('одной группы');
    expect(matchRepository.save).not.toHaveBeenCalled();
  });
  it('rejects reversed duplicate pairs and a team playing twice in one round', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    await service.saveManualMatch(10, 20, manualMatch);
    await expect(
      service.saveManualMatch(10, 20, {
        ...manualMatch,
        roundNumber: 2,
        homeTeamId: 102,
        awayTeamId: 101,
      }),
    ).rejects.toThrow('число кругов');
    await expect(
      service.saveManualMatch(10, 20, { ...manualMatch, awayTeamId: 103 }),
    ).rejects.toThrow('уже играет в этом туре');
    await service.saveManualMatch(10, 20, {
      ...manualMatch,
      roundNumber: 2,
      awayTeamId: 103,
    });
    expect(storedMatches).toHaveLength(2);
  });
  it('allows a return pairing for a two-leg stage but not an extra third meeting', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    stage.configuration = { type: 'group_stage', legs: 2 };
    await service.saveManualMatch(10, 20, manualMatch);
    await service.saveManualMatch(10, 20, {
      ...manualMatch,
      roundNumber: 2,
      homeTeamId: 102,
      awayTeamId: 101,
    });
    await expect(
      service.saveManualMatch(10, 20, { ...manualMatch, roundNumber: 3 }),
    ).rejects.toThrow('число кругов');
  });
  it('edits a pairing in place and retains the scheduled date and venue', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    const match = await service.saveManualMatch(10, 20, manualMatch);
    match.venueId = 5;
    match.matchDatetime = new Date('2026-11-01T15:00:00');
    const edited = await service.saveManualMatch(
      10,
      20,
      { ...manualMatch, roundNumber: 3, awayTeamId: 103 },
      match.id,
    );
    expect(edited).toMatchObject({
      id: match.id,
      roundNumber: 3,
      awayTeamId: 103,
      venueId: 5,
    });
    expect(edited.matchDatetime).toEqual(match.matchDatetime);
  });
  it('does not edit or remove a missing or started match', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    await expect(
      service.saveManualMatch(10, 20, manualMatch, 999),
    ).rejects.toThrow('не найден');
    await expect(service.removeManualMatch(10, 20, 999)).rejects.toThrow(
      'не найден',
    );
    const match = await service.saveManualMatch(10, 20, manualMatch);
    match.status = MatchStatus.LIVE;
    await expect(
      service.saveManualMatch(10, 20, manualMatch, match.id),
    ).rejects.toThrow('не начатых');
    await expect(service.removeManualMatch(10, 20, match.id)).rejects.toThrow(
      'Нельзя удалить',
    );
  });
  it('soft-cancels a single preparation match without removing its history', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    const match = await service.saveManualMatch(10, 20, manualMatch);
    await service.removeManualMatch(10, 20, match.id);
    expect(matchRepository.update).toHaveBeenCalledWith(
      { id: match.id },
      { status: MatchStatus.CANCELLED },
    );
  });
  it('allows replacing a cancelled pairing without restoring the old match', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    const match = await service.saveManualMatch(10, 20, manualMatch);
    await service.removeManualMatch(10, 20, match.id);
    await service.saveManualMatch(10, 20, manualMatch);
    expect(storedMatches).toHaveLength(2);
    expect(storedMatches[0].status).toBe(MatchStatus.CANCELLED);
  });
  it('blocks manual changes after launch and before application review is complete', async () => {
    await expect(service.saveManualMatch(10, 20, manualMatch)).rejects.toThrow(
      'до запуска',
    );
    await expect(service.removeManualMatch(10, 20, 1)).rejects.toThrow(
      'до запуска',
    );
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    tournament.registrationRequired = true;
    tournament.registrationStatus = 'open';
    await expect(service.saveManualMatch(10, 20, manualMatch)).rejects.toThrow(
      'закройте',
    );
    tournament.registrationStatus = 'closed';
    manager.exists.mockResolvedValue(true);
    await expect(service.saveManualMatch(10, 20, manualMatch)).rejects.toThrow(
      'рассмотрите',
    );
  });
  it('soft-cancels a preparation calendar only before launch', async () => {
    tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT;
    await service.generateSchedule(10, 20, { legs: 1 });
    expect(await service.resetPreparedSchedule(10, 20)).toEqual({
      cancelledMatches: 30,
    });
    expect(matchRepository.update).toHaveBeenCalledWith(expect.anything(), {
      status: MatchStatus.CANCELLED,
    });
    tournament.lifecycleStatus = TournamentLifecycleStatus.PUBLISHED;
    await expect(service.resetPreparedSchedule(10, 20)).rejects.toThrow(
      'только до запуска',
    );
  });

  describe('calendar spreadsheet confirmation', () => {
    const dto = (): PreviewScheduleImportDto => ({ mode: 'append', mappings: [], rows: [{ row: 2, group: 'A', roundNumber: 1, home: 'Команда 101', away: 'Команда 102', date: '01.11.2026', time: '15:00', venue: 'Спартак' }] });
    beforeEach(() => { tournament.lifecycleStatus = TournamentLifecycleStatus.DRAFT; });
    it('previews without writes, then saves all confirmed rows in a transaction', async () => {
      const request = dto();
      const preview = await service.previewCalendarImport(10, 20, request);
      expect(preview.valid).toBe(true);
      expect(matchRepository.save).not.toHaveBeenCalled();
      const result = await service.confirmCalendarImport(10, 20, { ...request, expectedVersion: preview.version });
      expect(result).toEqual({ createdMatches: 1, skippedMatches: 0, cancelledMatches: 0 });
      expect(storedMatches[0]).toMatchObject({ tournamentId: 10, stageId: 20, groupId: 1, homeTeamId: 101, venueId: 5, matchDatetime: new Date('2026-11-01T15:00:00') });
      expect(venueRepository.find).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    });
    it('rejects a stale preview and never partially writes invalid imports', async () => {
      const request = dto();
      await expect(service.confirmCalendarImport(10, 20, { ...request, expectedVersion: '0'.repeat(64) })).rejects.toThrow('изменились');
      const invalid = { ...request, mode: 'replace' as const, rows: [{ ...request.rows[0], away: 'Unknown' }] };
      const preview = await service.previewCalendarImport(10, 20, invalid);
      await expect(service.confirmCalendarImport(10, 20, { ...invalid, expectedVersion: preview.version, confirmation: 'REPLACE_PREPARED_SCHEDULE' })).rejects.toThrow('Исправьте ошибки');
      expect(matchRepository.save).not.toHaveBeenCalled();
      expect(matchRepository.update).not.toHaveBeenCalled();
    });
    it('soft-cancels the old stage schedule only after explicit replacement confirmation', async () => {
      await service.saveManualMatch(10, 20, manualMatch);
      const request = { ...dto(), mode: 'replace' as const };
      const preview = await service.previewCalendarImport(10, 20, request);
      await expect(service.confirmCalendarImport(10, 20, { ...request, expectedVersion: preview.version })).rejects.toThrow('Подтвердите');
      expect(matchRepository.update).not.toHaveBeenCalled();
      await service.confirmCalendarImport(10, 20, { ...request, expectedVersion: preview.version, confirmation: 'REPLACE_PREPARED_SCHEDULE' });
      expect(storedMatches).toHaveLength(2);
      expect(storedMatches[0].status).toBe(MatchStatus.CANCELLED);
      expect(storedMatches[1].status).toBe(MatchStatus.SCHEDULED);
    });
    it('does not duplicate an already imported calendar', async () => {
      const request = dto();
      const preview = await service.previewCalendarImport(10, 20, request);
      await service.confirmCalendarImport(10, 20, { ...request, expectedVersion: preview.version });
      const repeated = await service.previewCalendarImport(10, 20, request);
      expect(repeated).toMatchObject({ valid: true, skipCount: 1, createCount: 0 });
      await service.confirmCalendarImport(10, 20, { ...request, expectedVersion: repeated.version });
      expect(storedMatches).toHaveLength(1);
    });
  });
});
