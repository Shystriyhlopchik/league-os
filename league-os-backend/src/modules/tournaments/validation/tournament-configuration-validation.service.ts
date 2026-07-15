import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import type { TournamentRulesConfig } from '../../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../../tournament-teams/enums/tournament-team-status.enum';
import { TournamentEntity } from '../entities/tournaments.entity';
import { TournamentRulesConfigValidator } from './tournament-rules-config.validator';
import type {
  TournamentValidationIssue,
  TournamentValidationResult,
} from './tournament-validation-result.type';

@Injectable()
export class TournamentConfigurationValidationService {
  constructor(
    private readonly rulesValidator: TournamentRulesConfigValidator,
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentStageEntity)
    private readonly stageRepository: Repository<TournamentStageEntity>,
    @InjectRepository(TournamentGroupEntity)
    private readonly groupRepository: Repository<TournamentGroupEntity>,
    @InjectRepository(TournamentStageParticipantEntity)
    private readonly participantRepository: Repository<TournamentStageParticipantEntity>,
    @InjectRepository(TournamentTeamEntity)
    private readonly tournamentTeamRepository: Repository<TournamentTeamEntity>,
  ) {}

  async validate(
    tournamentId: number,
    config: TournamentRulesConfig,
  ): Promise<TournamentValidationResult> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const result = this.rulesValidator.validate(config);
    if (!result.valid) return result;

    const [stages, groups, participants, teamCount] = await Promise.all([
      this.stageRepository.find({
        where: { tournamentId },
        order: { order: 'ASC' },
      }),
      this.groupRepository
        .createQueryBuilder('group')
        .innerJoin('group.stage', 'stage')
        .where('stage.tournament_id = :tournamentId', { tournamentId })
        .getMany(),
      this.participantRepository
        .createQueryBuilder('participant')
        .innerJoin('participant.stage', 'stage')
        .where('stage.tournament_id = :tournamentId', { tournamentId })
        .getMany(),
      this.tournamentTeamRepository.count({
        where: { tournamentId, status: TournamentTeamStatus.ACTIVE },
      }),
    ]);

    const errors = [...result.errors];
    const warnings = [...result.warnings];
    const rulesByKey = new Map(
      config.stages.map((stage) => [stage.stageKey, stage]),
    );
    const stageById = new Map(stages.map((stage) => [stage.id, stage]));

    if (teamCount < 2) {
      this.add(
        errors,
        'INSUFFICIENT_TEAMS',
        '$.teams',
        'At least two active tournament teams are required',
      );
    }
    if (stages.length !== config.stages.length) {
      this.add(
        errors,
        'STAGE_COUNT_MISMATCH',
        '$.stages',
        `Stored structure has ${stages.length} stages, rules define ${config.stages.length}`,
      );
    }

    for (const stage of stages) {
      const rule = rulesByKey.get(stage.key);
      if (!rule) {
        this.add(
          errors,
          'MISSING_STAGE_RULES',
          `$.stages.${stage.key}`,
          'Stored stage has no matching typed rule configuration',
        );
        continue;
      }
      if (rule.type !== String(stage.type)) {
        this.add(
          errors,
          'STAGE_TYPE_MISMATCH',
          `$.stages.${stage.key}.type`,
          `Stored stage type is ${stage.type}, rules use ${rule.type}`,
        );
      }
    }

    const firstStage = stages[0];
    const participantsByStage = this.groupBy(
      participants,
      (item) => item.stageId,
    );
    if (firstStage) {
      const firstStageCount =
        participantsByStage.get(firstStage.id)?.length ?? 0;
      if (firstStageCount !== teamCount) {
        this.add(
          errors,
          'INITIAL_PARTICIPANT_COUNT_MISMATCH',
          `$.stages.${firstStage.key}.participants`,
          `First stage has ${firstStageCount} participants, tournament has ${teamCount} active teams`,
        );
      }
    }

    const groupsByStage = this.groupBy(groups, (group) => group.stageId);
    for (const stage of stages) {
      const rule = rulesByKey.get(stage.key);
      if (!rule || rule.type !== 'group_stage') continue;
      const stageGroups = groupsByStage.get(stage.id) ?? [];
      const stageParticipants = participantsByStage.get(stage.id) ?? [];
      if (stageGroups.length !== rule.groups.count) {
        this.add(
          errors,
          'GROUP_COUNT_MISMATCH',
          `$.stages.${stage.key}.groups`,
          `Stored structure has ${stageGroups.length} groups, rules require ${rule.groups.count}`,
        );
      }
      const validGroupIds = new Set(stageGroups.map((group) => group.id));
      const unassigned = stageParticipants.filter(
        (participant) =>
          !participant.groupId || !validGroupIds.has(participant.groupId),
      );
      if (unassigned.length > 0) {
        this.add(
          errors,
          'UNASSIGNED_GROUP_PARTICIPANTS',
          `$.stages.${stage.key}.participants`,
          `${unassigned.length} participants are not assigned to a group in this stage`,
        );
      }
      if (rule.groups.teamsPerGroup) {
        const expected = rule.groups.count * rule.groups.teamsPerGroup;
        if (stageParticipants.length !== expected) {
          this.add(
            errors,
            'GROUP_TEAM_COUNT_MISMATCH',
            `$.stages.${stage.key}.groups`,
            `Groups require ${expected} teams, stage has ${stageParticipants.length}`,
          );
        }
        for (const group of stageGroups) {
          const count = stageParticipants.filter(
            (participant) => participant.groupId === group.id,
          ).length;
          if (count !== rule.groups.teamsPerGroup) {
            this.add(
              errors,
              'GROUP_CAPACITY_MISMATCH',
              `$.stages.${stage.key}.groups.${group.key}`,
              `Group has ${count} participants, rules require ${rule.groups.teamsPerGroup}`,
            );
          }
        }
      }
    }

    for (const participant of participants) {
      if (!stageById.has(participant.stageId)) {
        this.add(
          errors,
          'INVALID_STAGE_PARTICIPANT',
          '$.participants',
          `Participant ${participant.id} references a stage outside the tournament`,
        );
      }
    }

    if (
      tournament.startDate &&
      tournament.endDate &&
      tournament.endDate < tournament.startDate
    ) {
      this.add(
        errors,
        'INVALID_TOURNAMENT_DATES',
        '$.dates',
        'Tournament end date cannot precede its start date',
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private groupBy<T, K>(items: T[], selector: (item: T) => K): Map<K, T[]> {
    const result = new Map<K, T[]>();
    for (const item of items) {
      const key = selector(item);
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return result;
  }

  private add(
    target: TournamentValidationIssue[],
    code: string,
    path: string,
    message: string,
  ): void {
    target.push({ code, path, message });
  }
}
