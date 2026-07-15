import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';

import { MatchEntity } from '../matches/entities/match.entity';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentRuleVersionStatus } from '../tournament-rules/enums/tournament-rule-version-status.enum';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { UserEntity } from '../users/entities/user.entity';
import { TournamentEntity } from './entities/tournaments.entity';
import { TournamentLifecycleStatus } from './enums/tournament-lifecycle-status.enum';
import { TournamentStatus } from './enums/tournament-status.enum';
import { TournamentLifecycleService } from './tournament-lifecycle.service';
import type { TournamentConfigurationValidationService } from './validation/tournament-configuration-validation.service';
import { createYardLeagueRules } from './validation/yard-league-rules.fixture';

const repository = <T>() =>
  ({
    create: jest.fn((value) => value),
    merge: jest.fn((target, value) => Object.assign(target, value)),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
    find: jest.fn(),
    exists: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  }) as unknown as Repository<T>;

describe('TournamentLifecycleService', () => {
  const tournaments = repository<TournamentEntity>();
  const members = repository<TournamentMemberEntity>();
  const stages = repository<TournamentStageEntity>();
  const groups = repository<TournamentGroupEntity>();
  const participants = repository<TournamentStageParticipantEntity>();
  const versions = repository<TournamentRuleVersionEntity>();
  const tournamentTeams = repository<TournamentTeamEntity>();
  const matches = repository<MatchEntity>();
  const users = repository<UserEntity>();
  const txTournaments = repository<TournamentEntity>();
  const txVersions = repository<TournamentRuleVersionEntity>();
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === TournamentEntity) return txTournaments;
      if (entity === MatchEntity) return matches;
      return txVersions;
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  } as unknown as DataSource;
  const validation = {
    validate: jest.fn(),
  } as unknown as TournamentConfigurationValidationService;

  const service = new TournamentLifecycleService(
    tournaments,
    members,
    stages,
    groups,
    participants,
    versions,
    tournamentTeams,
    matches,
    users,
    dataSource,
    validation,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(matches.exists).mockResolvedValue(false);
    jest.mocked(validation.validate).mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('creates a draft tournament owned by the authenticated user', async () => {
    const dto = { seasonId: 1, name: 'Cup', slug: 'cup' };

    const result = await service.create(dto, 42);

    expect(tournaments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 42,
        lifecycleStatus: TournamentLifecycleStatus.DRAFT,
        status: TournamentStatus.PLANNED,
      }),
    );
    expect(result.ownerUserId).toBe(42);
  });

  it('rejects structural changes after publication', async () => {
    jest.mocked(tournaments.findOne).mockResolvedValue({
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
    } as TournamentEntity);

    await expect(
      service.createStage(10, {
        key: 'groups',
        name: 'Groups',
        type: 'group_stage',
        order: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stages.save).not.toHaveBeenCalled();
  });

  it('rejects expression fields in stage JSON configuration', async () => {
    jest.mocked(tournaments.findOne).mockResolvedValue({
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.DRAFT,
    } as TournamentEntity);

    await expect(
      service.createStage(10, {
        key: 'groups',
        name: 'Groups',
        type: 'group_stage',
        order: 1,
        configuration: {
          schemaVersion: 1,
          type: 'group_stage',
          expression: 'require("child_process")',
        } as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an explicit change summary after the first finished match', async () => {
    jest.mocked(tournaments.findOne).mockResolvedValue({
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
      activeRuleVersionId: 4,
    } as TournamentEntity);
    jest.mocked(matches.exists).mockResolvedValue(true);

    await expect(
      service.createRuleVersion(10, { config: createYardLeagueRules() }, 42),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('creates an immutable next rule version based on the active version', async () => {
    jest.mocked(tournaments.findOne).mockResolvedValue({
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
      activeRuleVersionId: 4,
    } as TournamentEntity);
    jest.mocked(matches.exists).mockResolvedValue(true);
    jest.mocked(txTournaments.findOne).mockResolvedValue({
      id: 10,
      activeRuleVersionId: 4,
    } as TournamentEntity);
    jest.mocked(txVersions.findOne).mockResolvedValue({
      id: 4,
      version: 4,
    } as TournamentRuleVersionEntity);

    const result = await service.createRuleVersion(
      10,
      {
        config: createYardLeagueRules(),
        changeSummary: 'Clarified penalty shootout',
      },
      42,
    );

    expect(txVersions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 5,
        basedOnVersionId: 4,
        status: TournamentRuleVersionStatus.DRAFT,
        createdByUserId: 42,
      }),
    );
    expect(result.version).toBe(5);
    expect(versions.update).not.toHaveBeenCalled();
  });

  it('never overwrites a published rule version', async () => {
    jest.mocked(tournaments.findOne).mockResolvedValue({
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
      activeRuleVersionId: 2,
    } as TournamentEntity);
    jest.mocked(versions.findOne).mockResolvedValue({
      id: 2,
      tournamentId: 10,
      status: TournamentRuleVersionStatus.PUBLISHED,
      config: createYardLeagueRules(),
    } as TournamentRuleVersionEntity);

    await expect(
      service.updateDraftRuleVersion(10, 2, {
        config: createYardLeagueRules(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(versions.save).not.toHaveBeenCalled();
  });

  it('publishes a draft and supersedes the previous version without deleting history', async () => {
    const draftTournament = {
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.DRAFT,
      activeRuleVersionId: 1,
    } as TournamentEntity;
    const publishedTournament = {
      ...draftTournament,
      activeRuleVersionId: 2,
      lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
    } as TournamentEntity;
    jest
      .mocked(tournaments.findOne)
      .mockResolvedValueOnce(draftTournament)
      .mockResolvedValueOnce(publishedTournament);
    jest.mocked(versions.findOne).mockResolvedValue({
      id: 2,
      tournamentId: 10,
      schemaVersion: 1,
      status: TournamentRuleVersionStatus.DRAFT,
      basedOnVersionId: 1,
      changeSummary: 'Initial publication',
      config: createYardLeagueRules(),
    } as TournamentRuleVersionEntity);
    jest.mocked(txTournaments.findOne).mockResolvedValue(draftTournament);
    jest.mocked(txVersions.findOne).mockResolvedValue({
      id: 2,
      tournamentId: 10,
      status: TournamentRuleVersionStatus.DRAFT,
    } as TournamentRuleVersionEntity);

    const result = await service.publish(10, 2, 42);

    expect(txVersions.update).toHaveBeenCalledWith(
      { id: 1 },
      {
        status: TournamentRuleVersionStatus.SUPERSEDED,
      },
    );
    expect(txVersions.update).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        status: TournamentRuleVersionStatus.PUBLISHED,
        publishedByUserId: 42,
      }),
    );
    expect(txVersions.delete).not.toHaveBeenCalled();
    expect(txTournaments.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        activeRuleVersionId: 2,
        lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
      }),
    );
    expect(result).toBe(publishedTournament);
  });

  it('does not publish a stale silent draft after play has started', async () => {
    jest.mocked(tournaments.findOne).mockResolvedValue({
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
      activeRuleVersionId: 3,
    } as TournamentEntity);
    jest.mocked(versions.findOne).mockResolvedValue({
      id: 2,
      tournamentId: 10,
      schemaVersion: 1,
      status: TournamentRuleVersionStatus.DRAFT,
      basedOnVersionId: 1,
      config: createYardLeagueRules(),
    } as TournamentRuleVersionEntity);
    jest.mocked(matches.exists).mockResolvedValue(true);

    await expect(service.publish(10, 2, 42)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('moves a published tournament to in-progress after a completed match', async () => {
    await service.markInProgress(10);

    expect(tournaments.update).toHaveBeenCalledWith(
      {
        id: 10,
        lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
      },
      {
        lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
        status: TournamentStatus.ACTIVE,
      },
    );
  });

  it('completes a tournament only after every non-cancelled match is finished', async () => {
    const tournament = {
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
      status: TournamentStatus.ACTIVE,
    } as TournamentEntity;
    jest.mocked(tournaments.findOne).mockResolvedValue(tournament);
    jest
      .mocked(matches.count)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(0);

    const result = await service.complete(10);

    expect(result.lifecycleStatus).toBe(TournamentLifecycleStatus.COMPLETED);
    expect(result.status).toBe(TournamentStatus.FINISHED);
    expect(tournaments.save).toHaveBeenCalledWith(tournament);
  });
});
