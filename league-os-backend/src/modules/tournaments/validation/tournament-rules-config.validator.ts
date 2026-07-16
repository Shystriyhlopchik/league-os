import { Injectable } from '@nestjs/common';

import type { QualificationRuleV1 } from '../../tournament-rules/types/tournament-rules-config.type';
import type {
  TournamentValidationIssue,
  TournamentValidationResult,
} from './tournament-validation-result.type';

type JsonObject = Record<string, unknown>;

const SAFE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,99}$/;
const FINAL_TIE_BREAKERS = new Set(['manual_decision', 'draw', 'draw_lots']);
const CROSS_GROUP_CRITERIA = new Set([
  'points',
  'wins',
  'goal_difference',
  'goals_for',
  'goals_against_asc',
  'disciplinary_score_asc',
  'draw_lots',
]);

@Injectable()
export class TournamentRulesConfigValidator {
  validate(config: unknown): TournamentValidationResult {
    const errors: TournamentValidationIssue[] = [];
    const warnings: TournamentValidationIssue[] = [];
    const root = this.object(config, '$', errors);

    if (!root) {
      return { valid: false, errors, warnings };
    }

    this.exactKeys(
      root,
      ['schemaVersion', 'stages', 'transitions'],
      '$',
      errors,
    );
    if (root.schemaVersion !== 1) {
      this.error(
        errors,
        'UNSUPPORTED_SCHEMA_VERSION',
        '$.schemaVersion',
        'Only schemaVersion 1 is supported',
      );
    }

    const stages = this.array(root.stages, '$.stages', errors);
    const transitions = this.array(root.transitions, '$.transitions', errors);
    if (!stages || !transitions) {
      return { valid: false, errors, warnings };
    }
    if (stages.length === 0) {
      this.error(
        errors,
        'STAGES_REQUIRED',
        '$.stages',
        'At least one stage is required',
      );
    }

    const stageKeys = new Set<string>();
    const parsedStages = new Map<string, JsonObject>();
    stages.forEach((value, index) => {
      const path = `$.stages[${index}]`;
      const stage = this.validateStage(value, path, errors);
      if (!stage || typeof stage.stageKey !== 'string') return;
      if (stageKeys.has(stage.stageKey)) {
        this.error(
          errors,
          'DUPLICATE_STAGE_KEY',
          `${path}.stageKey`,
          'Stage keys must be unique',
        );
      }
      stageKeys.add(stage.stageKey);
      parsedStages.set(stage.stageKey, stage);
    });

    transitions.forEach((value, index) =>
      this.validateTransition(
        value,
        `$.transitions[${index}]`,
        parsedStages,
        errors,
      ),
    );

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateStage(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): JsonObject | undefined {
    const stage = this.object(value, path, errors);
    if (!stage) return undefined;

    const type = stage.type;
    const common = ['stageKey', 'type', 'match', 'discipline'];
    if (type === 'round_robin') {
      this.exactKeys(
        stage,
        [...common, 'schedule', 'scoring', 'standings'],
        path,
        errors,
      );
    } else if (type === 'group_stage') {
      this.exactKeys(
        stage,
        [...common, 'groups', 'schedule', 'scoring', 'standings'],
        path,
        errors,
      );
      this.validateGroups(stage.groups, `${path}.groups`, errors);
    } else if (type === 'knockout') {
      this.exactKeys(stage, [...common, 'bracket'], path, errors);
      this.validateBracket(stage.bracket, `${path}.bracket`, errors);
    } else {
      this.error(
        errors,
        'INVALID_STAGE_TYPE',
        `${path}.type`,
        'Unsupported stage type',
      );
    }

    this.safeKey(stage.stageKey, `${path}.stageKey`, errors);
    this.validateMatch(
      stage.match,
      `${path}.match`,
      type === 'knockout',
      errors,
    );
    this.validateDiscipline(stage.discipline, `${path}.discipline`, errors);

    if (type === 'round_robin' || type === 'group_stage') {
      this.validateSchedule(stage.schedule, `${path}.schedule`, errors);
      this.validateScoring(stage.scoring, `${path}.scoring`, errors);
      this.validateStandings(stage.standings, `${path}.standings`, errors);
    }
    return stage;
  }

  private validateGroups(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const groups = this.object(value, path, errors);
    if (!groups) return;
    this.exactKeys(groups, ['count', 'teamsPerGroup'], path, errors);
    this.positiveInteger(groups.count, `${path}.count`, errors);
    if (groups.teamsPerGroup !== undefined) {
      this.integerAtLeast(
        groups.teamsPerGroup,
        2,
        `${path}.teamsPerGroup`,
        errors,
      );
    }
  }

  private validateSchedule(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const schedule = this.object(value, path, errors);
    if (!schedule) return;
    this.exactKeys(
      schedule,
      ['algorithm', 'legs', 'balanceHomeAway'],
      path,
      errors,
    );
    if (schedule.algorithm !== 'circle') {
      this.error(
        errors,
        'INVALID_SCHEDULE_ALGORITHM',
        `${path}.algorithm`,
        'Only the circle algorithm is supported',
      );
    }
    if (![1, 2, 3, 4].includes(schedule.legs as number)) {
      this.error(
        errors,
        'INVALID_LEGS',
        `${path}.legs`,
        'legs must be between 1 and 4',
      );
    }
    this.boolean(schedule.balanceHomeAway, `${path}.balanceHomeAway`, errors);
  }

  private validateScoring(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const scoring = this.object(value, path, errors);
    if (!scoring) return;
    this.exactKeys(
      scoring,
      ['win', 'draw', 'loss', 'technicalWin', 'technicalLoss'],
      path,
      errors,
    );
    ['win', 'draw', 'loss'].forEach((key) => {
      if (scoring[key] === undefined) {
        this.error(
          errors,
          'SCORING_VALUE_REQUIRED',
          `${path}.${key}`,
          'Required scoring value is missing',
        );
      }
    });
    ['win', 'draw', 'loss', 'technicalWin', 'technicalLoss'].forEach((key) => {
      if (
        scoring[key] !== undefined &&
        (!Number.isInteger(scoring[key]) || (scoring[key] as number) < 0)
      ) {
        this.error(
          errors,
          'INVALID_SCORING_VALUE',
          `${path}.${key}`,
          'Scoring values must be non-negative integers',
        );
      }
    });
    if (
      typeof scoring.win === 'number' &&
      typeof scoring.draw === 'number' &&
      scoring.win <= scoring.draw
    ) {
      this.error(
        errors,
        'INVALID_SCORING_ORDER',
        path,
        'Win points must be greater than draw points',
      );
    }
  }

  private validateStandings(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const standings = this.object(value, path, errors);
    if (!standings) return;
    this.exactKeys(
      standings,
      ['tieBreakers', 'disciplinaryScore'],
      path,
      errors,
    );
    if (standings.disciplinaryScore !== undefined) {
      const score = this.object(
        standings.disciplinaryScore,
        `${path}.disciplinaryScore`,
        errors,
      );
      if (score) {
        this.exactKeys(
          score,
          ['yellowCard', 'secondYellowCard', 'redCard'],
          `${path}.disciplinaryScore`,
          errors,
        );
        ['yellowCard', 'secondYellowCard', 'redCard'].forEach((key) =>
          this.integerAtLeast(
            score[key],
            0,
            `${path}.disciplinaryScore.${key}`,
            errors,
          ),
        );
      }
    }
    const tieBreakers = this.array(
      standings.tieBreakers,
      `${path}.tieBreakers`,
      errors,
    );
    if (!tieBreakers) return;
    if (tieBreakers.length === 0) {
      this.error(
        errors,
        'TIE_BREAKERS_REQUIRED',
        `${path}.tieBreakers`,
        'At least one tie-breaker is required',
      );
      return;
    }
    const seen = new Set<string>();
    tieBreakers.forEach((value, index) => {
      const itemPath = `${path}.tieBreakers[${index}]`;
      const item = this.object(value, itemPath, errors);
      if (!item) return;
      const type = item.type;
      const allowed =
        type === 'head_to_head'
          ? ['type', 'metrics', 'reapplyAfterReduction']
          : type === 'goals_against'
            ? ['type', 'scope', 'order']
            : type === 'disciplinary_score' || type === 'technical_loss'
              ? ['type', 'order']
              : type === 'points' ||
                  type === 'wins' ||
                  type === 'goal_difference' ||
                  type === 'goals_for'
                ? ['type', 'scope']
                : type === 'manual_decision' ||
                    type === 'draw' ||
                    type === 'draw_lots'
                  ? ['type']
                  : undefined;
      if (!allowed) {
        this.error(
          errors,
          'INVALID_TIE_BREAKER',
          `${itemPath}.type`,
          'Unsupported tie-breaker',
        );
        return;
      }
      this.exactKeys(item, allowed, itemPath, errors);
      if (typeof type === 'string' && seen.has(type)) {
        this.error(
          errors,
          'DUPLICATE_TIE_BREAKER',
          `${itemPath}.type`,
          'Tie-breakers must not repeat',
        );
      }
      if (typeof type === 'string') seen.add(type);
      if (type === 'head_to_head') {
        const metrics = this.array(item.metrics, `${itemPath}.metrics`, errors);
        if (metrics?.length === 0) {
          this.error(
            errors,
            'HEAD_TO_HEAD_METRICS_REQUIRED',
            `${itemPath}.metrics`,
            'At least one head-to-head metric is required',
          );
        }
        const supported = new Set([
          'points',
          'wins',
          'goal_difference',
          'goals_for',
        ]);
        metrics?.forEach((metric, metricIndex) => {
          if (!supported.has(metric as string)) {
            this.error(
              errors,
              'INVALID_HEAD_TO_HEAD_METRIC',
              `${itemPath}.metrics[${metricIndex}]`,
              'Unsupported head-to-head metric',
            );
          }
        });
        this.boolean(
          item.reapplyAfterReduction,
          `${itemPath}.reapplyAfterReduction`,
          errors,
        );
      }
      if (
        [
          'points',
          'wins',
          'goal_difference',
          'goals_for',
          'goals_against',
        ].includes(type as string) &&
        item.scope !== 'all_matches'
      ) {
        this.error(
          errors,
          'INVALID_TIE_BREAKER_SCOPE',
          `${itemPath}.scope`,
          'Only all_matches scope is supported',
        );
      }
      if (
        ['goals_against', 'disciplinary_score', 'technical_loss'].includes(
          type as string,
        ) &&
        item.order !== 'asc'
      ) {
        this.error(
          errors,
          'INVALID_TIE_BREAKER_ORDER',
          `${itemPath}.order`,
          'This criterion must use ascending order',
        );
      }
    });
    const last = tieBreakers[tieBreakers.length - 1] as JsonObject | undefined;
    if (!last || !FINAL_TIE_BREAKERS.has(last.type as string)) {
      this.error(
        errors,
        'INCOMPLETE_TIE_BREAKERS',
        `${path}.tieBreakers`,
        'The final tie-breaker must be manual_decision, draw or draw_lots',
      );
    }
  }

  private validateMatch(
    value: unknown,
    path: string,
    knockout: boolean,
    errors: TournamentValidationIssue[],
  ): void {
    const match = this.object(value, path, errors);
    if (!match) return;
    this.exactKeys(
      match,
      [
        'periods',
        'periodDurationMinutes',
        'allowDraw',
        'extraTime',
        'penalties',
      ],
      path,
      errors,
    );
    this.positiveInteger(match.periods, `${path}.periods`, errors);
    if (match.periodDurationMinutes !== null) {
      this.positiveInteger(
        match.periodDurationMinutes,
        `${path}.periodDurationMinutes`,
        errors,
      );
    }
    this.boolean(match.allowDraw, `${path}.allowDraw`, errors);
    const extraTime = this.validateExtraTime(
      match.extraTime,
      `${path}.extraTime`,
      errors,
    );
    const penalties = this.validatePenalties(
      match.penalties,
      `${path}.penalties`,
      errors,
    );
    if (knockout && (match.allowDraw !== false || (!extraTime && !penalties))) {
      this.error(
        errors,
        'KNOCKOUT_WINNER_REQUIRED',
        path,
        'Knockout matches must forbid draws and enable extra time or penalties',
      );
    }
  }

  private validateExtraTime(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): boolean {
    const rule = this.object(value, path, errors);
    if (!rule) return false;
    if (rule.enabled === false) {
      this.exactKeys(rule, ['enabled'], path, errors);
      return false;
    }
    if (rule.enabled !== true) {
      this.error(
        errors,
        'INVALID_EXTRA_TIME',
        `${path}.enabled`,
        'enabled must be boolean',
      );
      return false;
    }
    this.exactKeys(
      rule,
      ['enabled', 'periods', 'periodDurationMinutes'],
      path,
      errors,
    );
    this.positiveInteger(rule.periods, `${path}.periods`, errors);
    this.positiveInteger(
      rule.periodDurationMinutes,
      `${path}.periodDurationMinutes`,
      errors,
    );
    return true;
  }

  private validatePenalties(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): boolean {
    const rule = this.object(value, path, errors);
    if (!rule) return false;
    if (rule.enabled === false) {
      this.exactKeys(rule, ['enabled'], path, errors);
      return false;
    }
    if (rule.enabled !== true) {
      this.error(
        errors,
        'INVALID_PENALTIES',
        `${path}.enabled`,
        'enabled must be boolean',
      );
      return false;
    }
    this.exactKeys(
      rule,
      ['enabled', 'initialKicksPerTeam', 'suddenDeath'],
      path,
      errors,
    );
    this.positiveInteger(
      rule.initialKicksPerTeam,
      `${path}.initialKicksPerTeam`,
      errors,
    );
    if (rule.suddenDeath !== true) {
      this.error(
        errors,
        'INVALID_PENALTIES',
        `${path}.suddenDeath`,
        'suddenDeath must be true',
      );
    }
    return true;
  }

  private validateDiscipline(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const discipline = this.object(value, path, errors);
    if (!discipline) return;
    this.exactKeys(
      discipline,
      [
        'accumulatedYellows',
        'secondYellowInMatch',
        'directRed',
        'stageTransition',
      ],
      path,
      errors,
    );
    this.validateAccumulatedYellows(
      discipline.accumulatedYellows,
      `${path}.accumulatedYellows`,
      errors,
    );
    this.validateSuspension(
      discipline.secondYellowInMatch,
      `${path}.secondYellowInMatch`,
      errors,
    );
    this.validateSuspension(discipline.directRed, `${path}.directRed`, errors);
    const transition = this.object(
      discipline.stageTransition,
      `${path}.stageTransition`,
      errors,
    );
    if (transition) {
      this.exactKeys(
        transition,
        ['carryYellowCards', 'carryPendingSuspensions'],
        `${path}.stageTransition`,
        errors,
      );
      this.boolean(
        transition.carryYellowCards,
        `${path}.stageTransition.carryYellowCards`,
        errors,
      );
      this.boolean(
        transition.carryPendingSuspensions,
        `${path}.stageTransition.carryPendingSuspensions`,
        errors,
      );
    }
  }

  private validateAccumulatedYellows(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const rule = this.object(value, path, errors);
    if (!rule) return;
    if (rule.enabled === false) {
      this.exactKeys(rule, ['enabled'], path, errors);
      return;
    }
    this.exactKeys(
      rule,
      ['enabled', 'threshold', 'suspensionMatches', 'progression'],
      path,
      errors,
    );
    if (rule.enabled !== true)
      this.error(
        errors,
        'INVALID_DISCIPLINE_RULE',
        `${path}.enabled`,
        'enabled must be boolean',
      );
    this.positiveInteger(rule.threshold, `${path}.threshold`, errors);
    this.positiveInteger(
      rule.suspensionMatches,
      `${path}.suspensionMatches`,
      errors,
    );
    if (
      ![
        'reset_after_suspension',
        'every_card_after_threshold',
        'repeat_every_threshold',
      ].includes(rule.progression as string)
    ) {
      this.error(
        errors,
        'INVALID_DISCIPLINE_PROGRESSION',
        `${path}.progression`,
        'Unsupported yellow-card progression',
      );
    }
  }

  private validateSuspension(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const rule = this.object(value, path, errors);
    if (!rule) return;
    if (rule.enabled === false) {
      this.exactKeys(rule, ['enabled'], path, errors);
      return;
    }
    this.exactKeys(
      rule,
      ['enabled', 'minimumMatches', 'allowManualExtension'],
      path,
      errors,
    );
    if (rule.enabled !== true)
      this.error(
        errors,
        'INVALID_DISCIPLINE_RULE',
        `${path}.enabled`,
        'enabled must be boolean',
      );
    this.positiveInteger(rule.minimumMatches, `${path}.minimumMatches`, errors);
    this.boolean(
      rule.allowManualExtension,
      `${path}.allowManualExtension`,
      errors,
    );
  }

  private validateBracket(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const bracket = this.object(value, path, errors);
    if (!bracket) return;
    this.exactKeys(
      bracket,
      ['size', 'placementMatch', 'seeding'],
      path,
      errors,
    );
    if (![2, 4, 8, 16, 32].includes(bracket.size as number)) {
      this.error(
        errors,
        'INVALID_BRACKET_SIZE',
        `${path}.size`,
        'Bracket size must be 2, 4, 8, 16 or 32',
      );
    }
    if (
      bracket.placementMatch !== undefined &&
      bracket.placementMatch !== 'third_place'
    ) {
      this.error(
        errors,
        'INVALID_PLACEMENT_MATCH',
        `${path}.placementMatch`,
        'Only third_place is supported',
      );
    }
    this.validateSeeding(bracket.seeding, `${path}.seeding`, errors);
  }

  private validateSeeding(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const seeding = this.object(value, path, errors);
    if (!seeding) return;
    if (seeding.type === 'random_draw' || seeding.type === 'manual') {
      this.exactKeys(seeding, ['type'], path, errors);
    } else if (seeding.type === 'standard') {
      this.exactKeys(seeding, ['type', 'ranking'], path, errors);
      this.validateCrossGroupRanking(
        seeding.ranking,
        `${path}.ranking`,
        errors,
      );
    } else if (seeding.type === 'best_eligible_opponent') {
      this.exactKeys(
        seeding,
        [
          'type',
          'protectedQualificationRuleId',
          'candidateQualificationRuleId',
          'candidateRanking',
          'constraints',
          'remaining',
        ],
        path,
        errors,
      );
      this.safeKey(
        seeding.protectedQualificationRuleId,
        `${path}.protectedQualificationRuleId`,
        errors,
      );
      this.safeKey(
        seeding.candidateQualificationRuleId,
        `${path}.candidateQualificationRuleId`,
        errors,
      );
      this.validateCrossGroupRanking(
        seeding.candidateRanking,
        `${path}.candidateRanking`,
        errors,
      );
      const constraints = this.array(
        seeding.constraints,
        `${path}.constraints`,
        errors,
      );
      constraints?.forEach((value, index) => {
        const constraintPath = `${path}.constraints[${index}]`;
        const constraint = this.object(value, constraintPath, errors);
        if (!constraint) return;
        this.exactKeys(constraint, ['type', 'mode'], constraintPath, errors);
        if (
          constraint.type !== 'avoid_same_source_group' ||
          !['required', 'best_effort'].includes(constraint.mode as string)
        ) {
          this.error(
            errors,
            'INVALID_PAIRING_CONSTRAINT',
            constraintPath,
            'Unsupported pairing constraint',
          );
        }
      });
      if (seeding.remaining !== 'pair_in_ranking_order') {
        this.error(
          errors,
          'INVALID_REMAINING_SEEDING',
          `${path}.remaining`,
          'Unsupported remaining-pair rule',
        );
      }
    } else {
      this.error(
        errors,
        'INVALID_SEEDING',
        `${path}.type`,
        'Unsupported seeding type',
      );
    }
  }

  private validateTransition(
    value: unknown,
    path: string,
    stages: Map<string, JsonObject>,
    errors: TournamentValidationIssue[],
  ): void {
    const transition = this.object(value, path, errors);
    if (!transition) return;
    this.exactKeys(
      transition,
      ['fromStageKey', 'toStageKey', 'qualification', 'confirmationRequired'],
      path,
      errors,
    );
    this.safeKey(transition.fromStageKey, `${path}.fromStageKey`, errors);
    this.safeKey(transition.toStageKey, `${path}.toStageKey`, errors);
    if (transition.confirmationRequired !== true) {
      this.error(
        errors,
        'CONFIRMATION_REQUIRED',
        `${path}.confirmationRequired`,
        'Stage transitions must require confirmation',
      );
    }
    const from = stages.get(transition.fromStageKey as string);
    const to = stages.get(transition.toStageKey as string);
    if (!from)
      this.error(
        errors,
        'UNKNOWN_SOURCE_STAGE',
        `${path}.fromStageKey`,
        'Source stage does not exist',
      );
    if (!to)
      this.error(
        errors,
        'UNKNOWN_TARGET_STAGE',
        `${path}.toStageKey`,
        'Target stage does not exist',
      );
    const qualifications = this.array(
      transition.qualification,
      `${path}.qualification`,
      errors,
    );
    if (!qualifications) return;
    if (qualifications.length === 0) {
      this.error(
        errors,
        'QUALIFICATION_REQUIRED',
        `${path}.qualification`,
        'At least one qualification rule is required',
      );
    }
    const ids = new Set<string>();
    let qualifiedCount = 0;
    qualifications.forEach((value, index) => {
      const rule = this.validateQualification(
        value,
        `${path}.qualification[${index}]`,
        from,
        errors,
      );
      if (!rule) return;
      if (ids.has(rule.id))
        this.error(
          errors,
          'DUPLICATE_QUALIFICATION_ID',
          `${path}.qualification[${index}].id`,
          'Qualification ids must be unique',
        );
      ids.add(rule.id);
      qualifiedCount += this.qualificationCount(rule, from);
    });
    if (to?.type === 'knockout') {
      const bracket = to.bracket as JsonObject | undefined;
      if (
        typeof bracket?.size === 'number' &&
        qualifiedCount !== bracket.size
      ) {
        this.error(
          errors,
          'QUALIFICATION_BRACKET_MISMATCH',
          `${path}.qualification`,
          `Qualification produces ${qualifiedCount} teams, but bracket size is ${bracket.size}`,
        );
      }
      const seeding = bracket?.seeding as JsonObject | undefined;
      if (seeding?.type === 'best_eligible_opponent') {
        for (const key of [
          'protectedQualificationRuleId',
          'candidateQualificationRuleId',
        ]) {
          if (!ids.has(seeding[key] as string)) {
            this.error(
              errors,
              'UNKNOWN_QUALIFICATION_REFERENCE',
              `${path}.qualification`,
              `Seeding references unknown qualification rule ${String(seeding[key])}`,
            );
          }
        }
      }
    }
  }

  private validateQualification(
    value: unknown,
    path: string,
    from: JsonObject | undefined,
    errors: TournamentValidationIssue[],
  ): (QualificationRuleV1 & { id: string }) | undefined {
    const rule = this.object(value, path, errors);
    if (!rule) return undefined;
    const type = rule.type;
    const keys =
      type === 'top_n_per_group'
        ? ['id', 'type', 'positions']
        : type === 'group_winners'
          ? ['id', 'type']
          : type === 'best_placed_between_groups'
            ? ['id', 'type', 'sourcePosition', 'count', 'ranking']
            : type === 'overall_ranking'
              ? ['id', 'type', 'count', 'ranking']
              : type === 'manual_selection'
                ? ['id', 'type', 'count']
                : undefined;
    if (!keys) {
      this.error(
        errors,
        'INVALID_QUALIFICATION_RULE',
        `${path}.type`,
        'Unsupported qualification rule',
      );
      return undefined;
    }
    this.exactKeys(rule, keys, path, errors);
    this.safeKey(rule.id, `${path}.id`, errors);
    if (
      [
        'top_n_per_group',
        'group_winners',
        'best_placed_between_groups',
      ].includes(type as string) &&
      from?.type !== 'group_stage'
    ) {
      this.error(
        errors,
        'INCOMPATIBLE_QUALIFICATION',
        path,
        'This qualification rule requires a group stage',
      );
    }
    if (type === 'top_n_per_group') {
      const positions = this.array(rule.positions, `${path}.positions`, errors);
      positions?.forEach((position, index) =>
        this.positiveInteger(position, `${path}.positions[${index}]`, errors),
      );
      if (positions && new Set(positions).size !== positions.length)
        this.error(
          errors,
          'DUPLICATE_POSITION',
          `${path}.positions`,
          'Qualification positions must be unique',
        );
      const teamsPerGroup = Number(
        (from?.groups as JsonObject | undefined)?.teamsPerGroup ?? 0,
      );
      if (
        teamsPerGroup > 0 &&
        positions?.some(
          (position) =>
            typeof position === 'number' && position > teamsPerGroup,
        )
      ) {
        this.error(
          errors,
          'QUALIFICATION_POSITION_OUT_OF_RANGE',
          `${path}.positions`,
          `Qualification position cannot exceed ${teamsPerGroup} teams per group`,
        );
      }
    }
    if (type === 'best_placed_between_groups') {
      this.positiveInteger(
        rule.sourcePosition,
        `${path}.sourcePosition`,
        errors,
      );
      this.positiveInteger(rule.count, `${path}.count`, errors);
      this.validateCrossGroupRanking(rule.ranking, `${path}.ranking`, errors);
      const groupSettings = from?.groups as JsonObject | undefined;
      if (
        typeof groupSettings?.teamsPerGroup === 'number' &&
        typeof rule.sourcePosition === 'number' &&
        rule.sourcePosition > groupSettings.teamsPerGroup
      ) {
        this.error(
          errors,
          'QUALIFICATION_POSITION_OUT_OF_RANGE',
          `${path}.sourcePosition`,
          'sourcePosition exceeds the number of teams per group',
        );
      }
      if (
        typeof groupSettings?.count === 'number' &&
        typeof rule.count === 'number' &&
        rule.count > groupSettings.count
      ) {
        this.error(
          errors,
          'QUALIFICATION_COUNT_OUT_OF_RANGE',
          `${path}.count`,
          'Cannot select more placed teams than there are groups',
        );
      }
    }
    if (type === 'overall_ranking') {
      this.positiveInteger(rule.count, `${path}.count`, errors);
      this.validateCrossGroupRanking(rule.ranking, `${path}.ranking`, errors);
    }
    if (type === 'manual_selection')
      this.positiveInteger(rule.count, `${path}.count`, errors);
    return rule as unknown as QualificationRuleV1 & { id: string };
  }

  private validateCrossGroupRanking(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const ranking = this.object(value, path, errors);
    if (!ranking) return;
    this.exactKeys(ranking, ['criteria'], path, errors);
    const criteria = this.array(ranking.criteria, `${path}.criteria`, errors);
    if (!criteria || criteria.length === 0) {
      this.error(
        errors,
        'RANKING_CRITERIA_REQUIRED',
        `${path}.criteria`,
        'Ranking criteria are required',
      );
      return;
    }
    criteria.forEach((criterion, index) => {
      if (!CROSS_GROUP_CRITERIA.has(criterion as string)) {
        this.error(
          errors,
          'INVALID_RANKING_CRITERION',
          `${path}.criteria[${index}]`,
          'Unsupported ranking criterion',
        );
      }
    });
    if (new Set(criteria).size !== criteria.length)
      this.error(
        errors,
        'DUPLICATE_RANKING_CRITERION',
        `${path}.criteria`,
        'Ranking criteria must not repeat',
      );
  }

  private qualificationCount(
    rule: QualificationRuleV1,
    from: JsonObject | undefined,
  ): number {
    const groupCount = Number(
      (from?.groups as JsonObject | undefined)?.count ?? 0,
    );
    if (rule.type === 'group_winners') return groupCount;
    if (rule.type === 'top_n_per_group')
      return groupCount * rule.positions.length;
    return rule.count;
  }

  private object(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): JsonObject | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.error(errors, 'OBJECT_REQUIRED', path, 'Expected an object');
      return undefined;
    }
    return value as JsonObject;
  }

  private array(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): unknown[] | undefined {
    if (!Array.isArray(value)) {
      this.error(errors, 'ARRAY_REQUIRED', path, 'Expected an array');
      return undefined;
    }
    return value as unknown[];
  }

  private exactKeys(
    value: JsonObject,
    allowed: string[],
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    const allowedSet = new Set(allowed);
    Object.keys(value).forEach((key) => {
      if (!allowedSet.has(key)) {
        this.error(
          errors,
          'UNSUPPORTED_FIELD',
          `${path}.${key}`,
          'This field is not part of the typed rule schema',
        );
      }
    });
  }

  private safeKey(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    if (typeof value !== 'string' || !SAFE_KEY_PATTERN.test(value)) {
      this.error(
        errors,
        'INVALID_KEY',
        path,
        'Expected a safe identifier, not an expression',
      );
    }
  }

  private positiveInteger(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    this.integerAtLeast(value, 1, path, errors);
  }

  private integerAtLeast(
    value: unknown,
    minimum: number,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    if (!Number.isInteger(value) || (value as number) < minimum) {
      this.error(
        errors,
        'INVALID_INTEGER',
        path,
        `Expected an integer greater than or equal to ${minimum}`,
      );
    }
  }

  private boolean(
    value: unknown,
    path: string,
    errors: TournamentValidationIssue[],
  ): void {
    if (typeof value !== 'boolean')
      this.error(errors, 'BOOLEAN_REQUIRED', path, 'Expected a boolean');
  }

  private error(
    errors: TournamentValidationIssue[],
    code: string,
    path: string,
    message: string,
  ): void {
    errors.push({ code, path, message });
  }
}
