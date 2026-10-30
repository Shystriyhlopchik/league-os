import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';

import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentRuleVersionStatus } from '../tournament-rules/enums/tournament-rule-version-status.enum';
import type { TournamentRulesConfig } from '../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../tournament-stages/enums/tournament-stage-type.enum';
import type { TournamentStageConfiguration } from '../tournament-stages/types/tournament-stage-configuration.type';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../tournament-teams/enums/tournament-team-status.enum';
import { UserEntity } from '../users/entities/user.entity';
import { CreateGroupRequestDto } from './dto/create-group-request.dto';
import { CreateRuleVersionRequestDto } from './dto/create-rule-version-request.dto';
import { CreateStageParticipantRequestDto } from './dto/create-stage-participant-request.dto';
import { CreateStageRequestDto } from './dto/create-stage-request.dto';
import { CreateUserTournamentDto } from './dto/create-user-tournament.dto';
import { ManageTournamentMemberDto } from './dto/manage-tournament-member.dto';
import { PreviewTournamentDto } from './dto/preview-tournament.dto';
import { UpdateGroupRequestDto } from './dto/update-group-request.dto';
import { UpdateStageParticipantRequestDto } from './dto/update-stage-participant-request.dto';
import { UpdateStageRequestDto } from './dto/update-stage-request.dto';
import { UpdateUserTournamentDto } from './dto/update-user-tournament.dto';
import { TournamentEntity } from './entities/tournaments.entity';
import { TournamentLifecycleStatus } from './enums/tournament-lifecycle-status.enum';
import { TournamentStatus } from './enums/tournament-status.enum';
import { TournamentConfigurationValidationService } from './validation/tournament-configuration-validation.service';
import type { TournamentValidationResult } from './validation/tournament-validation-result.type';
import { CommunitiesService } from '../communities/communities.service';
import { CommunityMemberEntity } from '../communities/entities/community-member.entity';
import { SeasonEntity } from '../seasons/entities/season.entity';
import { TournamentApplicationEntity } from '../registrations/entities/registration.entity';
import { VenueEntity } from '../venues/entities/venue.entity';
import { formatLocalDateTime } from '../matches/helper/formatLocalDateTime';
import { UpdateCalendarMatchDto } from './dto/update-calendar-match.dto';

const POST_PUBLISH_METADATA_FIELDS = new Set([
  'name',
  'description',
  'colorPrimary',
  'colorSecondary',
  'logoUrl',
]);

@Injectable()
export class TournamentLifecycleService {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentMemberEntity)
    private readonly memberRepository: Repository<TournamentMemberEntity>,
    @InjectRepository(TournamentStageEntity)
    private readonly stageRepository: Repository<TournamentStageEntity>,
    @InjectRepository(TournamentGroupEntity)
    private readonly groupRepository: Repository<TournamentGroupEntity>,
    @InjectRepository(TournamentStageParticipantEntity)
    private readonly participantRepository: Repository<TournamentStageParticipantEntity>,
    @InjectRepository(TournamentRuleVersionEntity)
    private readonly ruleVersionRepository: Repository<TournamentRuleVersionEntity>,
    @InjectRepository(TournamentTeamEntity)
    private readonly tournamentTeamRepository: Repository<TournamentTeamEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly configurationValidation: TournamentConfigurationValidationService,
    private readonly communitiesService: CommunitiesService,
    @InjectRepository(SeasonEntity)
    private readonly seasonRepository: Repository<SeasonEntity>,
    @InjectRepository(CommunityMemberEntity)
    private readonly communityMemberRepository: Repository<CommunityMemberEntity>,
  ) {}

  async create(
    dto: CreateUserTournamentDto,
    ownerUserId: number,
  ): Promise<TournamentEntity> {
    const season = await this.seasonRepository.findOne({
      where: { id: dto.seasonId, isActive: true },
      relations: { competition: true },
    });
    if (!season?.competition?.isActive)
      throw new NotFoundException('Сезон не найден');
    if (
      dto.communityId !== undefined &&
      dto.communityId !== season.competition.communityId
    )
      throw new BadRequestException('Сезон принадлежит другому сообществу');
    const owner = await this.userRepository.findOne({
      where: { id: ownerUserId, isActive: true },
      relations: { roles: true },
    });
    if (!owner) throw new NotFoundException('Пользователь не найден');
    await this.communitiesService.assertAccess(season.competition.communityId, {
      id: ownerUserId,
      roles: owner.roles.map((r) => r.code),
    });
    const details = { ...dto };
    delete details.communityId;
    const tournament = this.tournamentRepository.create({
      ...details,
      ownerUserId,
      registrationRequired: true,
      lifecycleStatus: TournamentLifecycleStatus.DRAFT,
      status: TournamentStatus.PLANNED,
      isActive: true,
    });
    return this.tournamentRepository.save(tournament);
  }

  async update(
    tournamentId: number,
    dto: UpdateUserTournamentDto,
  ): Promise<TournamentEntity> {
    const tournament = await this.getTournament(tournamentId);
    const originalSeason = await this.seasonRepository.findOne({
      where: { id: tournament.seasonId },
      relations: { competition: true },
    });
    if (!originalSeason) throw new NotFoundException('Сезон не найден');
    if (
      dto.communityId !== undefined &&
      dto.communityId !== originalSeason.competition.communityId
    )
      throw new BadRequestException(
        'Нельзя перенести турнир в другое сообщество',
      );
    if (dto.seasonId !== undefined && dto.seasonId !== tournament.seasonId) {
      const nextSeason = await this.seasonRepository.findOne({
        where: { id: dto.seasonId, isActive: true },
        relations: { competition: true },
      });
      if (
        !nextSeason ||
        nextSeason.competition.communityId !==
          originalSeason.competition.communityId
      )
        throw new BadRequestException('Сезон принадлежит другому сообществу');
    }
    const details = { ...dto };
    delete details.communityId;
    if (tournament.lifecycleStatus !== TournamentLifecycleStatus.DRAFT) {
      const structuralFields = Object.keys(details).filter(
        (field) => !POST_PUBLISH_METADATA_FIELDS.has(field),
      );
      if (structuralFields.length > 0) {
        throw new ConflictException(
          `Structural fields cannot be changed after publication: ${structuralFields.join(', ')}`,
        );
      }
    }
    if (tournament.lifecycleStatus === TournamentLifecycleStatus.COMPLETED) {
      throw new ConflictException('Completed tournament is read-only');
    }
    return this.tournamentRepository.save(
      this.tournamentRepository.merge(tournament, details),
    );
  }

  async getBuilderDraft(tournamentId: number) {
    const tournament = await this.getTournament(tournamentId);
    const stages = await this.stageRepository.find({
      where: { tournamentId },
      order: { order: 'ASC' },
    });
    const stageIds = stages.map((stage) => stage.id);
    const [groups, participants, ruleVersions, tournamentTeams] =
      await Promise.all([
        stageIds.length
          ? this.groupRepository.find({
              where: { stageId: In(stageIds) },
              order: { order: 'ASC' },
            })
          : ([] as TournamentGroupEntity[]),
        stageIds.length
          ? this.participantRepository.find({
              where: { stageId: In(stageIds) },
              relations: { tournamentTeam: { team: true } },
              order: { id: 'ASC' },
            })
          : ([] as TournamentStageParticipantEntity[]),
        this.ruleVersionRepository.find({
          where: { tournamentId },
          order: { version: 'DESC' },
        }),
        this.tournamentTeamRepository.find({
          where: { tournamentId, status: TournamentTeamStatus.ACTIVE },
          relations: { team: true },
          order: { id: 'ASC' },
        }),
      ]);

    return {
      tournament,
      stages: stages.map((stage) => ({
        ...stage,
        groups: groups.filter((group) => group.stageId === stage.id),
        participants: participants.filter(
          (participant) => participant.stageId === stage.id,
        ),
      })),
      tournamentTeams,
      ruleVersions,
    };
  }

  async addTournamentTeam(
    tournamentId: number,
    teamId: number,
  ): Promise<TournamentTeamEntity> {
    const tournament = await this.assertDraft(tournamentId);
    const existing = await this.tournamentTeamRepository.findOne({
      where: { tournamentId, teamId },
    });
    if (existing) return existing;
    if (tournament.registrationRequired)
      throw new ConflictException(
        'Команда становится участником только после утверждения заявки',
      );
    return this.tournamentTeamRepository.save(
      this.tournamentTeamRepository.create({ tournamentId, teamId }),
    );
  }

  async setMember(
    tournamentId: number,
    dto: ManageTournamentMemberDto,
  ): Promise<TournamentMemberEntity> {
    const tournament = await this.getTournament(tournamentId);
    if (
      !(await this.userRepository.exists({
        where: { id: dto.userId, isActive: true },
      }))
    ) {
      throw new NotFoundException('User not found');
    }
    const season = await this.seasonRepository.findOne({
      where: { id: tournament.seasonId },
      relations: { competition: true },
    });
    if (
      !season ||
      !(await this.communityMemberRepository.exists({
        where: {
          communityId: season.competition.communityId,
          userId: dto.userId,
          isActive: true,
        },
      }))
    )
      throw new BadRequestException(
        'Сначала добавьте пользователя в сообщество',
      );
    const existing = await this.memberRepository.findOne({
      where: { tournamentId, userId: dto.userId },
    });
    const member = existing
      ? this.memberRepository.merge(existing, { role: dto.role })
      : this.memberRepository.create({
          tournamentId,
          userId: dto.userId,
          role: dto.role,
        });
    return this.memberRepository.save(member);
  }

  async removeMember(tournamentId: number, userId: number): Promise<void> {
    await this.getTournament(tournamentId);
    await this.memberRepository.delete({ tournamentId, userId });
  }

  async createStage(
    tournamentId: number,
    dto: CreateStageRequestDto,
  ): Promise<TournamentStageEntity> {
    await this.assertDraft(tournamentId);
    this.assertStageConfiguration(dto.type, dto.configuration);
    return this.stageRepository.save(
      this.stageRepository.create({ ...dto, tournamentId }),
    );
  }

  async updateStage(
    tournamentId: number,
    stageId: number,
    dto: UpdateStageRequestDto,
  ): Promise<TournamentStageEntity> {
    await this.assertDraft(tournamentId);
    await this.assertStageScheduleEmpty(stageId);
    const stage = await this.getStage(tournamentId, stageId);
    if (dto.configuration) {
      this.assertStageConfiguration(dto.type ?? stage.type, dto.configuration);
    }
    return this.stageRepository.save(this.stageRepository.merge(stage, dto));
  }

  async removeStage(tournamentId: number, stageId: number): Promise<void> {
    await this.assertDraft(tournamentId);
    await this.assertStageScheduleEmpty(stageId);
    await this.getStage(tournamentId, stageId);
    await this.stageRepository.delete(stageId);
  }

  async createGroup(
    tournamentId: number,
    stageId: number,
    dto: CreateGroupRequestDto,
  ): Promise<TournamentGroupEntity> {
    await this.assertDraft(tournamentId);
    await this.assertStageScheduleEmpty(stageId);
    await this.getStage(tournamentId, stageId);
    return this.groupRepository.save(
      this.groupRepository.create({ ...dto, stageId }),
    );
  }

  async updateGroup(
    tournamentId: number,
    stageId: number,
    groupId: number,
    dto: UpdateGroupRequestDto,
  ): Promise<TournamentGroupEntity> {
    await this.assertDraft(tournamentId);
    await this.assertStageScheduleEmpty(stageId);
    await this.getStage(tournamentId, stageId);
    const group = await this.getGroup(stageId, groupId);
    return this.groupRepository.save(this.groupRepository.merge(group, dto));
  }

  async removeGroup(
    tournamentId: number,
    stageId: number,
    groupId: number,
  ): Promise<void> {
    await this.assertDraft(tournamentId);
    await this.assertStageScheduleEmpty(stageId);
    await this.getStage(tournamentId, stageId);
    await this.getGroup(stageId, groupId);
    await this.groupRepository.delete(groupId);
  }

  async addStageParticipant(
    tournamentId: number,
    stageId: number,
    dto: CreateStageParticipantRequestDto,
  ): Promise<TournamentStageParticipantEntity> {
    await this.assertDraft(tournamentId);
    await this.assertStageScheduleEmpty(stageId);
    await this.assertParticipantReferences(tournamentId, stageId, dto);
    return this.participantRepository.save(
      this.participantRepository.create({ ...dto, stageId }),
    );
  }

  async updateStageParticipant(
    tournamentId: number,
    stageId: number,
    participantId: number,
    dto: UpdateStageParticipantRequestDto,
  ): Promise<TournamentStageParticipantEntity> {
    await this.assertDraft(tournamentId);
    await this.assertStageScheduleEmpty(stageId);
    const participant = await this.participantRepository.findOne({
      where: { id: participantId, stageId },
    });
    if (!participant)
      throw new NotFoundException('Stage participant not found');
    const merged = this.participantRepository.merge(participant, dto);
    await this.assertParticipantReferences(tournamentId, stageId, merged);
    return this.participantRepository.save(merged);
  }

  async removeStageParticipant(
    tournamentId: number,
    stageId: number,
    participantId: number,
  ): Promise<void> {
    await this.assertDraft(tournamentId);
    await this.assertStageScheduleEmpty(stageId);
    await this.getStage(tournamentId, stageId);
    const result = await this.participantRepository.delete({
      id: participantId,
      stageId,
    });
    if (!result.affected)
      throw new NotFoundException('Stage participant not found');
  }

  async createRuleVersion(
    tournamentId: number,
    dto: CreateRuleVersionRequestDto,
    userId: number,
  ): Promise<TournamentRuleVersionEntity> {
    const tournament = await this.getTournament(tournamentId);
    if (tournament.lifecycleStatus === TournamentLifecycleStatus.COMPLETED) {
      throw new ConflictException('Completed tournament is read-only');
    }

    const schemaVersion = dto.schemaVersion ?? dto.config.schemaVersion;
    if (schemaVersion !== dto.config.schemaVersion || schemaVersion !== 1) {
      throw new BadRequestException(
        'schemaVersion must match config.schemaVersion and be supported',
      );
    }

    const validation = await this.configurationValidation.validate(
      tournamentId,
      dto.config,
      tournament.lifecycleStatus === TournamentLifecycleStatus.DRAFT,
    );
    if (!validation.valid) {
      throw new BadRequestException(validation);
    }

    const hasFinishedMatch = await this.matchRepository.exists({
      where: { tournamentId, status: MatchStatus.FINISHED },
    });
    if (hasFinishedMatch && !dto.changeSummary?.trim()) {
      throw new BadRequestException(
        'changeSummary is required after the first completed match',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const tournaments = manager.getRepository(TournamentEntity);
      const versions = manager.getRepository(TournamentRuleVersionEntity);
      const matches = manager.getRepository(MatchEntity);
      const lockedTournament = await tournaments.findOne({
        where: { id: tournamentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedTournament)
        throw new NotFoundException('Tournament not found');
      if (
        !dto.changeSummary?.trim() &&
        (await matches.exists({
          where: { tournamentId, status: MatchStatus.FINISHED },
        }))
      ) {
        throw new ConflictException(
          'A match was completed; create the version with changeSummary',
        );
      }
      const latest = await versions.findOne({
        where: { tournamentId },
        order: { version: 'DESC' },
      });
      return versions.save(
        versions.create({
          tournamentId,
          version: (latest?.version ?? 0) + 1,
          schemaVersion,
          config: dto.config,
          status: TournamentRuleVersionStatus.DRAFT,
          basedOnVersionId: lockedTournament.activeRuleVersionId,
          createdByUserId: userId,
          changeSummary: dto.changeSummary?.trim() || undefined,
        }),
      );
    });
  }

  async getRuleVersions(
    tournamentId: number,
  ): Promise<TournamentRuleVersionEntity[]> {
    await this.getTournament(tournamentId);
    return this.ruleVersionRepository.find({
      where: { tournamentId },
      order: { version: 'DESC' },
    });
  }

  async updateDraftRuleVersion(
    tournamentId: number,
    ruleVersionId: number,
    dto: CreateRuleVersionRequestDto,
  ): Promise<TournamentRuleVersionEntity> {
    const tournament = await this.getTournament(tournamentId);
    if (tournament.lifecycleStatus === TournamentLifecycleStatus.COMPLETED) {
      throw new ConflictException('Completed tournament is read-only');
    }
    const version = await this.getRuleVersion(tournamentId, ruleVersionId);
    if (version.status !== TournamentRuleVersionStatus.DRAFT) {
      throw new ConflictException('Published rule versions are immutable');
    }
    const schemaVersion = dto.schemaVersion ?? dto.config.schemaVersion;
    if (schemaVersion !== dto.config.schemaVersion || schemaVersion !== 1) {
      throw new BadRequestException(
        'schemaVersion must match config.schemaVersion and be supported',
      );
    }
    const hasFinishedMatch = await this.matchRepository.exists({
      where: { tournamentId, status: MatchStatus.FINISHED },
    });
    const changeSummary = dto.changeSummary?.trim() || version.changeSummary;
    if (
      hasFinishedMatch &&
      (!changeSummary ||
        version.basedOnVersionId !== tournament.activeRuleVersionId)
    ) {
      throw new ConflictException(
        'After the first completed match, edit only a new version based on the active rules and provide changeSummary',
      );
    }
    const validation = await this.configurationValidation.validate(
      tournamentId,
      dto.config,
      tournament.lifecycleStatus === TournamentLifecycleStatus.DRAFT,
    );
    if (!validation.valid) throw new BadRequestException(validation);

    return this.ruleVersionRepository.save(
      this.ruleVersionRepository.merge(version, {
        schemaVersion,
        config: dto.config,
        changeSummary,
      }),
    );
  }

  async preview(
    tournamentId: number,
    dto: PreviewTournamentDto,
  ): Promise<TournamentValidationResult> {
    const config = await this.resolveConfiguration(tournamentId, dto);
    const result = await this.configurationValidation.validate(
      tournamentId,
      config,
      dto.mode === 'configuration',
    );
    if (dto.mode === 'configuration' || !result.valid) return result;
    const tournament = await this.getTournament(tournamentId);
    const errors = [
      ...result.errors,
      ...(await this.launchPreparationErrors(tournament, config)),
    ];
    return { ...result, valid: errors.length === 0, errors };
  }

  private async launchPreparationErrors(
    tournament: TournamentEntity,
    config: TournamentRulesConfig,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TournamentValidationResult['errors']> {
    if (
      !tournament.registrationRequired ||
      tournament.lifecycleStatus !== TournamentLifecycleStatus.DRAFT
    )
      return [];
    const errors: TournamentValidationResult['errors'] = [];
    const add = (code: string, path: string, message: string) =>
      errors.push({ code, path, message });
    if (tournament.registrationStatus !== 'closed')
      add(
        'REGISTRATION_NOT_CLOSED',
        '$.registration',
        'Перед запуском закройте приём заявок',
      );
    if (
      await manager.exists(TournamentApplicationEntity, {
        where: { tournamentId: tournament.id, status: 'submitted' },
      })
    )
      add(
        'APPLICATIONS_PENDING',
        '$.applications',
        'Сначала рассмотрите все отправленные заявки',
      );
    const rules = config.stages.filter((s) => s.type === 'group_stage');
    if (!rules.length) return errors;
    const stages = await manager.find(TournamentStageEntity, {
      where: { tournamentId: tournament.id },
      relations: { groups: true, participants: { tournamentTeam: true } },
    });
    const matches = await manager.find(MatchEntity, {
      where: {
        tournamentId: tournament.id,
        status: Not(MatchStatus.CANCELLED),
      },
    });
    for (const rule of rules) {
      if (rule.type !== 'group_stage') continue;
      const stage = stages.find((s) => s.key === rule.stageKey);
      if (!stage) continue; // Structural validation reports the missing stage.
      const stageMatches = matches.filter((m) => m.stageId === stage.id);
      let complete = stageMatches.every(
        (m) =>
          m.roundType === MatchRoundType.GROUP_ROUND &&
          (m.roundNumber ?? 0) > 0,
      );
      const groupIds = new Set(stage.groups.map((g) => g.id));
      if (stageMatches.some((m) => !m.groupId || !groupIds.has(m.groupId)))
        complete = false;
      for (const group of stage.groups) {
        const ids = stage.participants
          .filter((p) => p.groupId === group.id)
          .map((p) => p.tournamentTeam.teamId);
        const fixtures = stageMatches.filter((m) => m.groupId === group.id);
        const counts = new Map<string, number>();
        const roundTeams = new Set<string>();
        for (const m of fixtures) {
          for (const teamId of [m.homeTeamId, m.awayTeamId]) {
            const key = `${m.roundNumber}:${teamId}`;
            if (roundTeams.has(key)) complete = false;
            roundTeams.add(key);
          }
          if (
            !ids.includes(m.homeTeamId) ||
            !ids.includes(m.awayTeamId) ||
            m.homeTeamId === m.awayTeamId
          )
            complete = false;
          const key = [m.homeTeamId, m.awayTeamId]
            .sort((a, b) => a - b)
            .join(':');
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const legs = rule.schedule.legs;
        if (fixtures.length !== ((ids.length * (ids.length - 1)) / 2) * legs)
          complete = false;
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++) {
            if (
              counts.get([ids[i], ids[j]].sort((a, b) => a - b).join(':')) !==
              legs
            )
              complete = false;
          }
      }
      if (!complete || !stageMatches.length)
        add(
          'CALENDAR_INCOMPLETE',
          `$.stages.${stage.key}.calendar`,
          `${stage.name}: сформируйте полный календарь для текущих групп и числа кругов; команда не должна играть дважды в одном туре`,
        );
      if (stageMatches.some((m) => !m.matchDatetime || !m.venueId))
        add(
          'CALENDAR_NOT_SCHEDULED',
          `$.stages.${stage.key}.calendar`,
          `${stage.name}: назначьте всем матчам дату, время и площадку`,
        );
    }
    return errors;
  }

  async publish(
    tournamentId: number,
    ruleVersionId: number,
    userId: number,
  ): Promise<TournamentEntity> {
    const tournament = await this.getTournament(tournamentId);
    if (tournament.lifecycleStatus === TournamentLifecycleStatus.COMPLETED) {
      throw new ConflictException('Completed tournament is read-only');
    }
    const version = await this.getRuleVersion(tournamentId, ruleVersionId);
    if (version.status !== TournamentRuleVersionStatus.DRAFT) {
      throw new ConflictException('Only a draft rule version can be published');
    }
    if (version.schemaVersion !== version.config.schemaVersion) {
      throw new BadRequestException(
        'Rule version schemaVersion does not match its configuration',
      );
    }
    const hasFinishedMatch = await this.matchRepository.exists({
      where: { tournamentId, status: MatchStatus.FINISHED },
    });
    if (
      hasFinishedMatch &&
      (!version.changeSummary?.trim() ||
        version.basedOnVersionId !== tournament.activeRuleVersionId)
    ) {
      throw new ConflictException(
        'After the first completed match, publish a new version based on the active rules and provide changeSummary',
      );
    }
    const validation = await this.configurationValidation.validate(
      tournamentId,
      version.config,
    );
    if (!validation.valid) throw new BadRequestException(validation);

    await this.dataSource.transaction(async (manager) => {
      const tournaments = manager.getRepository(TournamentEntity);
      const versions = manager.getRepository(TournamentRuleVersionEntity);
      const matches = manager.getRepository(MatchEntity);
      const lockedTournament = await tournaments.findOne({
        where: { id: tournamentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedTournament)
        throw new NotFoundException('Tournament not found');
      const preparationErrors = await this.launchPreparationErrors(
        lockedTournament,
        version.config,
        manager,
      );
      if (preparationErrors.length)
        throw new BadRequestException({
          valid: false,
          errors: preparationErrors,
          warnings: [],
        });
      const lockedVersion = await versions.findOne({
        where: { id: ruleVersionId, tournamentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !lockedVersion ||
        lockedVersion.status !== TournamentRuleVersionStatus.DRAFT
      ) {
        throw new ConflictException('Rule version is no longer publishable');
      }
      const finishedMatchExists = await matches.exists({
        where: { tournamentId, status: MatchStatus.FINISHED },
      });
      if (
        finishedMatchExists &&
        (!lockedVersion.changeSummary?.trim() ||
          lockedVersion.basedOnVersionId !==
            lockedTournament.activeRuleVersionId)
      ) {
        throw new ConflictException(
          'Rule version became stale after a completed match',
        );
      }

      if (lockedTournament.activeRuleVersionId) {
        await versions.update(
          { id: lockedTournament.activeRuleVersionId },
          { status: TournamentRuleVersionStatus.SUPERSEDED },
        );
      }
      await versions.update(ruleVersionId, {
        status: TournamentRuleVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: userId,
      });
      await tournaments.update(tournamentId, {
        activeRuleVersionId: ruleVersionId,
        lifecycleStatus:
          lockedTournament.lifecycleStatus ===
          TournamentLifecycleStatus.IN_PROGRESS
            ? TournamentLifecycleStatus.IN_PROGRESS
            : TournamentLifecycleStatus.PUBLISHED,
        status: TournamentStatus.ACTIVE,
      });
      // Fixtures prepared in the draft become official with the launched rules.
      if (
        lockedTournament.registrationRequired &&
        lockedTournament.lifecycleStatus === TournamentLifecycleStatus.DRAFT
      )
        await matches.update(
          { tournamentId, status: MatchStatus.SCHEDULED },
          { effectiveRuleVersionId: ruleVersionId },
        );
    });

    return this.getTournament(tournamentId);
  }

  async markInProgress(tournamentId: number): Promise<void> {
    await this.tournamentRepository.update(
      {
        id: tournamentId,
        lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
      },
      {
        lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
        status: TournamentStatus.ACTIVE,
      },
    );
  }

  async calendar(tournamentId: number) {
    const tournament = await this.getTournament(tournamentId);
    const [stages, matches, venues] = await Promise.all([
      this.stageRepository.find({
        where: { tournamentId },
        order: { order: 'ASC' },
      }),
      this.matchRepository.find({
        where: { tournamentId, status: Not(MatchStatus.CANCELLED) },
        relations: { homeTeam: true, awayTeam: true },
        order: { stageId: 'ASC', roundNumber: 'ASC', id: 'ASC' },
      }),
      this.dataSource
        .getRepository(VenueEntity)
        .find({ where: { isActive: true }, order: { name: 'ASC' } }),
    ]);
    return {
      tournament,
      stages,
      venues: venues.map((v) => ({ id: v.id, name: v.name })),
      matches: matches.map((m) => ({
        id: m.id,
        stageId: m.stageId,
        round: m.round,
        status: m.status,
        home: m.homeTeam?.name ?? 'Участник уточняется',
        away: m.awayTeam?.name ?? 'Участник уточняется',
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        groupId: m.groupId,
        roundNumber: m.roundNumber,
        matchDatetime: formatLocalDateTime(m.matchDatetime),
        venueId: m.venueId,
      })),
    };
  }

  async updateCalendarMatch(
    tournamentId: number,
    matchId: number,
    dto: UpdateCalendarMatchDto,
  ) {
    const date = new Date(dto.matchDatetime);
    if (
      !Number.isFinite(date.getTime()) ||
      formatLocalDateTime(date)?.slice(0, 16) !== dto.matchDatetime.slice(0, 16)
    )
      throw new BadRequestException('Некорректная дата матча');
    return this.dataSource.transaction(async (manager) => {
      const tournament = await manager.findOne(TournamentEntity, {
        where: { id: tournamentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !tournament ||
        ![
          TournamentLifecycleStatus.DRAFT,
          TournamentLifecycleStatus.PUBLISHED,
          TournamentLifecycleStatus.IN_PROGRESS,
        ].includes(tournament.lifecycleStatus!)
      )
        throw new ConflictException(
          'Календарь завершённого турнира недоступен для изменения',
        );
      if (
        tournament.lifecycleStatus === TournamentLifecycleStatus.DRAFT &&
        tournament.registrationRequired &&
        tournament.registrationStatus !== 'closed'
      )
        throw new ConflictException(
          'Сначала закройте приём заявок и распределите команды по группам',
        );
      const match = await manager.findOne(MatchEntity, {
        where: { id: matchId, tournamentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!match || match.status !== MatchStatus.SCHEDULED)
        throw new ConflictException(
          'Можно назначать только ещё не начатый матч',
        );
      if (
        !(await manager.exists(VenueEntity, {
          where: { id: dto.venueId, isActive: true },
        }))
      )
        throw new NotFoundException('Площадка не найдена');
      // Venue lock serializes competing bookings even from different tournaments.
      await manager.findOne(VenueEntity, {
        where: { id: dto.venueId },
        lock: { mode: 'pessimistic_write' },
      });
      const collision = await manager.exists(MatchEntity, {
        where: {
          id: Not(matchId),
          venueId: dto.venueId,
          matchDatetime: date,
          status: Not(MatchStatus.CANCELLED),
        },
      });
      if (collision)
        throw new ConflictException(
          'На этой площадке в это время уже назначен матч',
        );
      match.matchDatetime = date;
      if (match.bracketSnapshotId) {
        const bracket = await manager.find(MatchEntity, {
          where: { bracketSnapshotId: match.bracketSnapshotId },
        });
        const times = bracket.map((m) => ({
          ...m,
          matchDatetime: m.id === match.id ? date : m.matchDatetime,
        }));
        for (const candidate of times) {
          if (!candidate.matchDatetime) continue;
          const secondLeg =
            candidate.bracketPosition?.match(/^((?:QF|SF)-\d+):L2$/);
          const firstLeg = secondLeg
            ? times.find((m) => m.bracketPosition === `${secondLeg[1]}:L1`)
            : undefined;
          if (
            firstLeg?.matchDatetime &&
            candidate.matchDatetime <= firstLeg.matchDatetime
          ) {
            throw new ConflictException(
              'Ответный матч должен проходить позже первого',
            );
          }
          for (const source of [
            candidate.homeParticipantSource,
            candidate.awayParticipantSource,
          ]) {
            if (source?.type !== 'match_outcome') continue;
            if (
              times.some(
                (m) =>
                  m.bracketPosition?.replace(/:L[12]$/, '') ===
                    source.bracketPosition &&
                  m.matchDatetime &&
                  m.matchDatetime >= candidate.matchDatetime!,
              )
            ) {
              throw new ConflictException(
                'Следующий раунд должен проходить после предыдущих встреч',
              );
            }
          }
        }
      }
      match.venueId = dto.venueId;
      await manager.save(match);
      return {
        id: match.id,
        matchDatetime: formatLocalDateTime(date),
        venueId: match.venueId,
      };
    });
  }

  async complete(tournamentId: number): Promise<TournamentEntity> {
    const tournament = await this.getTournament(tournamentId);
    if (
      tournament.lifecycleStatus !== TournamentLifecycleStatus.PUBLISHED &&
      tournament.lifecycleStatus !== TournamentLifecycleStatus.IN_PROGRESS
    ) {
      throw new ConflictException(
        'Only a published or in-progress tournament can be completed',
      );
    }
    const [matchCount, unfinishedCount] = await Promise.all([
      this.matchRepository.count({
        where: { tournamentId, status: Not(MatchStatus.CANCELLED) },
      }),
      this.matchRepository.count({
        where: {
          tournamentId,
          status: Not(In([MatchStatus.FINISHED, MatchStatus.CANCELLED])),
        },
      }),
    ]);
    if (matchCount === 0 || unfinishedCount > 0) {
      throw new ConflictException(
        'Tournament can be completed only when all matches are finished',
      );
    }
    tournament.lifecycleStatus = TournamentLifecycleStatus.COMPLETED;
    tournament.status = TournamentStatus.FINISHED;
    return this.tournamentRepository.save(tournament);
  }

  private async resolveConfiguration(
    tournamentId: number,
    dto: PreviewTournamentDto,
  ): Promise<TournamentRulesConfig> {
    if (dto.config) return dto.config;
    if (dto.ruleVersionId) {
      return (await this.getRuleVersion(tournamentId, dto.ruleVersionId))
        .config;
    }
    const latest = await this.ruleVersionRepository.findOne({
      where: { tournamentId },
      order: { version: 'DESC' },
    });
    if (!latest) {
      throw new BadRequestException(
        'Provide config or ruleVersionId; tournament has no rule versions',
      );
    }
    return latest.config;
  }

  private async assertDraft(tournamentId: number): Promise<TournamentEntity> {
    const tournament = await this.getTournament(tournamentId);
    if (tournament.lifecycleStatus !== TournamentLifecycleStatus.DRAFT) {
      throw new ConflictException(
        'Tournament structure can be changed only in draft status',
      );
    }
    return tournament;
  }

  private async getTournament(tournamentId: number): Promise<TournamentEntity> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    return tournament;
  }

  private async getStage(
    tournamentId: number,
    stageId: number,
  ): Promise<TournamentStageEntity> {
    const stage = await this.stageRepository.findOne({
      where: { id: stageId, tournamentId },
    });
    if (!stage) throw new NotFoundException('Tournament stage not found');
    return stage;
  }

  private async getGroup(
    stageId: number,
    groupId: number,
  ): Promise<TournamentGroupEntity> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId, stageId },
    });
    if (!group) throw new NotFoundException('Tournament group not found');
    return group;
  }

  private async getRuleVersion(
    tournamentId: number,
    ruleVersionId: number,
  ): Promise<TournamentRuleVersionEntity> {
    const version = await this.ruleVersionRepository.findOne({
      where: { id: ruleVersionId, tournamentId },
    });
    if (!version) throw new NotFoundException('Rule version not found');
    return version;
  }

  private async assertParticipantReferences(
    tournamentId: number,
    stageId: number,
    dto: Pick<CreateStageParticipantRequestDto, 'tournamentTeamId' | 'groupId'>,
  ): Promise<void> {
    await this.getStage(tournamentId, stageId);
    const tournamentTeam = await this.tournamentTeamRepository.findOne({
      where: { id: dto.tournamentTeamId, tournamentId },
      select: { id: true },
    });
    if (!tournamentTeam) {
      throw new BadRequestException(
        'Tournament team does not belong to this tournament',
      );
    }
    if (dto.groupId) await this.getGroup(stageId, dto.groupId);
  }

  private async assertStageScheduleEmpty(stageId: number): Promise<void> {
    const matches = await this.matchRepository.count({
      where: { stageId, status: Not(MatchStatus.CANCELLED) },
    });
    if (matches > 0) {
      throw new ConflictException(
        'Календарь уже сформирован. Сначала сбросьте подготовленный календарь, затем измените структуру или группы',
      );
    }
  }

  private assertStageConfiguration(
    type: TournamentStageType,
    configuration: Partial<TournamentStageConfiguration> | undefined,
  ): void {
    if (!configuration) return;
    const value = configuration as Record<string, unknown>;
    const common = ['schemaVersion', 'type'];
    const allowed =
      type === TournamentStageType.ROUND_ROBIN
        ? [...common, 'legs']
        : type === TournamentStageType.GROUP_STAGE
          ? [...common, 'groupsCount', 'teamsPerGroup', 'groupSizes', 'legs']
          : [...common, 'bracketSize', 'thirdPlaceMatch'];
    const unknownFields = Object.keys(value).filter(
      (key) => !allowed.includes(key),
    );
    if (unknownFields.length > 0) {
      throw new BadRequestException(
        `Unsupported stage configuration fields: ${unknownFields.join(', ')}`,
      );
    }
    if (value.schemaVersion !== undefined && value.schemaVersion !== 1) {
      throw new BadRequestException(
        'Stage configuration supports only schemaVersion 1',
      );
    }
    if (value.type !== undefined && value.type !== type) {
      throw new BadRequestException(
        'Stage configuration type must match the stage type',
      );
    }
    if (
      value.legs !== undefined &&
      ![1, 2, 3, 4].includes(value.legs as number)
    ) {
      throw new BadRequestException('Stage legs must be between 1 and 4');
    }
    if (
      value.groupsCount !== undefined &&
      (!Number.isInteger(value.groupsCount) ||
        (value.groupsCount as number) < 1)
    ) {
      throw new BadRequestException('groupsCount must be a positive integer');
    }
    if (
      value.teamsPerGroup !== undefined &&
      (!Number.isInteger(value.teamsPerGroup) ||
        (value.teamsPerGroup as number) < 2)
    ) {
      throw new BadRequestException('teamsPerGroup must be at least 2');
    }
    if (value.teamsPerGroup !== undefined && value.groupSizes !== undefined) {
      throw new BadRequestException(
        'Use either teamsPerGroup or groupSizes, not both',
      );
    }
    if (value.groupSizes !== undefined) {
      if (
        !Array.isArray(value.groupSizes) ||
        value.groupSizes.some(
          (size) => !Number.isInteger(size) || (size as number) < 2,
        )
      ) {
        throw new BadRequestException(
          'groupSizes must contain integers of at least 2',
        );
      }
      if (
        typeof value.groupsCount === 'number' &&
        value.groupSizes.length !== value.groupsCount
      ) {
        throw new BadRequestException(
          'groupSizes must contain one value for every group',
        );
      }
    }
    if (
      value.bracketSize !== undefined &&
      ![2, 4, 8, 16, 32].includes(value.bracketSize as number)
    ) {
      throw new BadRequestException('Unsupported bracketSize');
    }
    if (
      value.thirdPlaceMatch !== undefined &&
      typeof value.thirdPlaceMatch !== 'boolean'
    ) {
      throw new BadRequestException('thirdPlaceMatch must be boolean');
    }
  }
}
