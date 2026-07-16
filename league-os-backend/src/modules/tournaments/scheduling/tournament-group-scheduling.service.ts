import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';

import { MatchEntity } from '../../matches/entities/match.entity';
import { MatchRoundType } from '../../matches/enums/match-round-type.enum';
import { MatchStatus } from '../../matches/enums/match-status.enum';
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageStatus } from '../../tournament-stages/enums/tournament-stage-status.enum';
import { TournamentStageType } from '../../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../../tournament-teams/enums/tournament-team-status.enum';
import type { AssignStageGroupsDto } from '../dto/assign-stage-groups.dto';
import {
  GROUP_STAGE_SCHEDULE_RESET_CONFIRMATION,
  type GenerateGroupStageScheduleDto,
} from '../dto/generate-group-stage-schedule.dto';
import type { PreviewGroupStageScheduleDto } from '../dto/preview-group-stage-schedule.dto';
import { GroupAssignmentStrategy } from '../enums/group-assignment-strategy.enum';
import { TournamentEntity } from '../entities/tournaments.entity';
import { TournamentLifecycleStatus } from '../enums/tournament-lifecycle-status.enum';
import {
  GroupAssignmentStrategyService,
  type PlannedGroupAssignment,
} from './group-assignment-strategy.service';
import {
  RoundRobinGenerator,
  type RoundRobinRound,
} from './round-robin-generator';

interface ScheduleRepositories {
  tournaments: Repository<TournamentEntity>;
  stages: Repository<TournamentStageEntity>;
  groups: Repository<TournamentGroupEntity>;
  participants: Repository<TournamentStageParticipantEntity>;
  teams: Repository<TournamentTeamEntity>;
  matches: Repository<MatchEntity>;
}

interface ScheduleContext {
  stage: TournamentStageEntity;
  groups: TournamentGroupEntity[];
  participants: TournamentStageParticipantEntity[];
  activeTeams: TournamentTeamEntity[];
}

interface PlannedScheduleMatch {
  tournamentId: number;
  stageId: number;
  groupId: number;
  roundNumber: number;
  homeTeamId: number;
  awayTeamId: number;
  round: string;
}

export interface GroupSchedulePreview {
  groupId: number;
  groupKey: string;
  rounds: RoundRobinRound[];
  matchCount: number;
}

export interface GroupStageSchedulePreview {
  tournamentId: number;
  stageId: number;
  legs: number;
  totalMatches: number;
  groups: GroupSchedulePreview[];
}

@Injectable()
export class TournamentGroupSchedulingService {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentStageEntity)
    private readonly stageRepository: Repository<TournamentStageEntity>,
    @InjectRepository(TournamentGroupEntity)
    private readonly groupRepository: Repository<TournamentGroupEntity>,
    @InjectRepository(TournamentStageParticipantEntity)
    private readonly participantRepository: Repository<TournamentStageParticipantEntity>,
    @InjectRepository(TournamentTeamEntity)
    private readonly teamRepository: Repository<TournamentTeamEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    private readonly dataSource: DataSource,
    private readonly assignmentStrategy: GroupAssignmentStrategyService,
    private readonly roundRobinGenerator: RoundRobinGenerator,
  ) {}

  async previewGroupAssignments(
    tournamentId: number,
    stageId: number,
    dto: AssignStageGroupsDto,
  ) {
    const context = await this.loadContext(
      tournamentId,
      stageId,
      this.repositories(),
    );
    this.assertGroupStage(context.stage);
    const assignments = this.planAssignments(context, dto);
    return this.mapAssignmentPreview(context, assignments, dto.randomSeed);
  }

  async assignGroups(
    tournamentId: number,
    stageId: number,
    dto: AssignStageGroupsDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repositories = this.repositories(manager);
      const context = await this.loadContext(
        tournamentId,
        stageId,
        repositories,
        true,
      );
      this.assertGroupStage(context.stage);
      this.assertTournamentWritable(context.stage.tournament);
      if (context.stage.status !== TournamentStageStatus.PENDING) {
        throw new ConflictException(
          'Group composition can be changed only while the stage is pending',
        );
      }
      const stageMatches = await repositories.matches.count({
        where: { stageId, status: Not(MatchStatus.CANCELLED) },
      });
      if (stageMatches > 0) {
        throw new ConflictException(
          'Reset the generated schedule before changing group composition',
        );
      }

      const assignments = this.planAssignments(context, dto);
      const existingByTeam = new Map(
        context.participants.map((participant) => [
          participant.tournamentTeamId,
          participant,
        ]),
      );
      const entities = assignments.map((assignment) => {
        const existing = existingByTeam.get(assignment.tournamentTeamId);
        if (existing) {
          existing.groupId = assignment.groupId;
          return existing;
        }
        return repositories.participants.create({
          stageId,
          tournamentTeamId: assignment.tournamentTeamId,
          groupId: assignment.groupId,
        });
      });
      await repositories.participants.save(entities);

      return this.mapAssignmentPreview(context, assignments, dto.randomSeed);
    });
  }

  async previewSchedule(
    tournamentId: number,
    stageId: number,
    dto: PreviewGroupStageScheduleDto,
  ): Promise<GroupStageSchedulePreview> {
    const context = await this.loadContext(
      tournamentId,
      stageId,
      this.repositories(),
    );
    return this.buildPreview(context, dto.legs);
  }

  async generateSchedule(
    tournamentId: number,
    stageId: number,
    dto: GenerateGroupStageScheduleDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repositories = this.repositories(manager);
      const context = await this.loadContext(
        tournamentId,
        stageId,
        repositories,
        true,
      );
      const preview = this.buildPreview(context, dto.legs);
      this.assertTournamentWritable(context.stage.tournament);
      const plannedMatches = this.flattenSchedule(context, preview);
      const existing = await repositories.matches.find({
        where: {
          stageId,
          roundType: MatchRoundType.GROUP_ROUND,
          status: Not(MatchStatus.CANCELLED),
        },
        order: { groupId: 'ASC', roundNumber: 'ASC', id: 'ASC' },
      });

      if (this.isSameSchedule(existing, plannedMatches)) {
        return {
          ...preview,
          createdMatches: 0,
          idempotent: true,
          matches: existing,
        };
      }

      if (existing.length > 0) {
        const started =
          context.stage.status !== TournamentStageStatus.PENDING ||
          existing.some((match) =>
            [MatchStatus.LIVE, MatchStatus.FINISHED].includes(match.status),
          );
        if (dto.resetConfirmation !== GROUP_STAGE_SCHEDULE_RESET_CONFIRMATION) {
          throw new ConflictException(
            started
              ? 'Stage has started; confirm RESET_GROUP_STAGE_SCHEDULE to replace its schedule'
              : 'A different schedule already exists; confirm RESET_GROUP_STAGE_SCHEDULE to replace it',
          );
        }
        await repositories.matches.update(
          { id: In(existing.map((match) => match.id)) },
          { status: MatchStatus.CANCELLED },
        );
      }

      const effectiveRuleVersionId =
        context.stage.tournament.activeRuleVersionId;
      const created = await repositories.matches.save(
        plannedMatches.map((match) =>
          repositories.matches.create({
            ...match,
            roundType: MatchRoundType.GROUP_ROUND,
            status: MatchStatus.SCHEDULED,
            effectiveRuleVersionId,
          }),
        ),
      );

      return {
        ...preview,
        createdMatches: created.length,
        idempotent: false,
        matches: created,
      };
    });
  }

  private async loadContext(
    tournamentId: number,
    stageId: number,
    repositories: ScheduleRepositories,
    lock = false,
  ): Promise<ScheduleContext> {
    const stage = await repositories.stages.findOne({
      where: { id: stageId, tournamentId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!stage) throw new NotFoundException('Tournament stage not found');

    const tournament = await repositories.tournaments.findOne({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    stage.tournament = tournament;

    const [groups, participants, activeTeams] = await Promise.all([
      repositories.groups.find({
        where: { stageId },
        order: { order: 'ASC', id: 'ASC' },
      }),
      repositories.participants.find({
        where: { stageId },
        relations: { tournamentTeam: true },
      }),
      repositories.teams.find({
        where: { tournamentId, status: TournamentTeamStatus.ACTIVE },
        order: { seedNumber: 'ASC', id: 'ASC' },
      }),
    ]);
    return { stage, groups, participants, activeTeams };
  }

  private buildPreview(
    context: ScheduleContext,
    legs: number,
  ): GroupStageSchedulePreview {
    this.assertGroupStage(context.stage);
    const activeTeamIds = new Set(context.activeTeams.map((team) => team.id));
    const activeParticipants = context.participants.filter((participant) =>
      activeTeamIds.has(participant.tournamentTeamId),
    );
    if (activeParticipants.length !== context.activeTeams.length) {
      throw new ConflictException(
        'Every active tournament team must be assigned to the stage',
      );
    }
    if (activeParticipants.some((participant) => !participant.groupId)) {
      throw new ConflictException(
        'Every active stage participant must be assigned to a group',
      );
    }
    const groupIds = new Set(context.groups.map((group) => group.id));
    if (
      activeParticipants.some(
        (participant) =>
          !participant.groupId || !groupIds.has(participant.groupId),
      )
    ) {
      throw new ConflictException(
        'Every participant group must belong to the current stage',
      );
    }

    const groups = context.groups.map((group) => {
      const participants = activeParticipants
        .filter((participant) => participant.groupId === group.id)
        .sort(
          (left, right) =>
            (left.seedNumber ?? left.tournamentTeam.seedNumber ?? 0) -
              (right.seedNumber ?? right.tournamentTeam.seedNumber ?? 0) ||
            left.tournamentTeamId - right.tournamentTeamId,
        );
      if (participants.length < 2) {
        throw new ConflictException(
          `Group ${group.key} requires at least two teams`,
        );
      }
      if (group.capacity && participants.length > group.capacity) {
        throw new ConflictException(`Group ${group.key} capacity exceeded`);
      }
      const teamIdByTournamentTeamId = new Map(
        participants.map((participant) => [
          participant.tournamentTeamId,
          participant.tournamentTeam.teamId,
        ]),
      );
      const generated = this.roundRobinGenerator.generate(
        participants.map((participant) => participant.tournamentTeamId),
        legs,
      );
      const rounds = generated.map((round) => ({
        ...round,
        pairs: round.pairs.map((pair) => ({
          homeTeamId: teamIdByTournamentTeamId.get(pair.homeTeamId) as number,
          awayTeamId: teamIdByTournamentTeamId.get(pair.awayTeamId) as number,
        })),
        byeTeamId:
          round.byeTeamId === undefined
            ? undefined
            : teamIdByTournamentTeamId.get(round.byeTeamId),
      }));
      return {
        groupId: group.id,
        groupKey: group.key,
        rounds,
        matchCount: rounds.reduce(
          (total, round) => total + round.pairs.length,
          0,
        ),
      };
    });

    return {
      tournamentId: context.stage.tournamentId,
      stageId: context.stage.id,
      legs,
      totalMatches: groups.reduce(
        (total, group) => total + group.matchCount,
        0,
      ),
      groups,
    };
  }

  private flattenSchedule(
    context: ScheduleContext,
    preview: GroupStageSchedulePreview,
  ): PlannedScheduleMatch[] {
    return preview.groups.flatMap((group) =>
      group.rounds.flatMap((round) =>
        round.pairs.map((pair) => ({
          tournamentId: context.stage.tournamentId,
          stageId: context.stage.id,
          groupId: group.groupId,
          roundNumber: round.roundNumber,
          homeTeamId: pair.homeTeamId,
          awayTeamId: pair.awayTeamId,
          round: `Group ${group.groupKey}, round ${round.roundNumber}`,
        })),
      ),
    );
  }

  private isSameSchedule(
    existing: MatchEntity[],
    planned: PlannedScheduleMatch[],
  ): boolean {
    if (existing.length !== planned.length) return false;
    const keys = new Set(existing.map((match) => this.matchKey(match)));
    return planned.every((match) => keys.has(this.matchKey(match)));
  }

  private matchKey(
    match: Pick<
      MatchEntity,
      'groupId' | 'roundNumber' | 'homeTeamId' | 'awayTeamId'
    >,
  ): string {
    return `${match.groupId}:${match.roundNumber}:${match.homeTeamId}:${match.awayTeamId}`;
  }

  private mapAssignmentPreview(
    context: ScheduleContext,
    assignments: PlannedGroupAssignment[],
    requestedSeed: number | undefined,
  ) {
    const teamById = new Map(
      context.activeTeams.map((team) => [team.id, team]),
    );
    return {
      tournamentId: context.stage.tournamentId,
      stageId: context.stage.id,
      randomSeed:
        requestedSeed ??
        context.stage.tournamentId * 100_000 + context.stage.id,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        teamId: teamById.get(assignment.tournamentTeamId)?.teamId,
        seedNumber: teamById.get(assignment.tournamentTeamId)?.seedNumber,
      })),
      groups: context.groups.map((group) => ({
        groupId: group.id,
        groupKey: group.key,
        tournamentTeamIds: assignments
          .filter((assignment) => assignment.groupId === group.id)
          .map((assignment) => assignment.tournamentTeamId),
      })),
    };
  }

  private planAssignments(
    context: ScheduleContext,
    dto: AssignStageGroupsDto,
  ): PlannedGroupAssignment[] {
    const defaultSeed = context.stage.tournamentId * 100_000 + context.stage.id;
    const requested = this.assignmentStrategy.plan(
      dto,
      context.groups,
      context.activeTeams,
      defaultSeed,
    );
    if (dto.strategy !== GroupAssignmentStrategy.MANUAL) return requested;

    const activeTeamIds = new Set(context.activeTeams.map((team) => team.id));
    const merged = new Map<number, PlannedGroupAssignment>();
    context.participants.forEach((participant) => {
      if (
        participant.groupId &&
        activeTeamIds.has(participant.tournamentTeamId)
      ) {
        merged.set(participant.tournamentTeamId, {
          tournamentTeamId: participant.tournamentTeamId,
          groupId: participant.groupId,
        });
      }
    });
    requested.forEach((assignment) =>
      merged.set(assignment.tournamentTeamId, assignment),
    );
    return this.assignmentStrategy.plan(
      {
        ...dto,
        assignments: [...merged.values()],
      },
      context.groups,
      context.activeTeams,
      defaultSeed,
    );
  }

  private assertGroupStage(stage: TournamentStageEntity): void {
    if (stage.type !== TournamentStageType.GROUP_STAGE) {
      throw new BadRequestException(
        'Group assignment and group schedule require a group_stage',
      );
    }
  }

  private assertTournamentWritable(tournament: TournamentEntity): void {
    if (tournament.lifecycleStatus === TournamentLifecycleStatus.COMPLETED) {
      throw new ConflictException('Completed tournament is read-only');
    }
  }

  private repositories(manager?: EntityManager): ScheduleRepositories {
    return {
      tournaments:
        manager?.getRepository(TournamentEntity) ?? this.tournamentRepository,
      stages:
        manager?.getRepository(TournamentStageEntity) ?? this.stageRepository,
      groups:
        manager?.getRepository(TournamentGroupEntity) ?? this.groupRepository,
      participants:
        manager?.getRepository(TournamentStageParticipantEntity) ??
        this.participantRepository,
      teams:
        manager?.getRepository(TournamentTeamEntity) ?? this.teamRepository,
      matches: manager?.getRepository(MatchEntity) ?? this.matchRepository,
    };
  }
}
