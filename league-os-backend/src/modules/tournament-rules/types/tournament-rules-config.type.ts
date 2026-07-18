export interface TournamentRulesConfigV1 {
  schemaVersion: 1;
  stages: StageRulesV1[];
  transitions: StageTransitionRuleV1[];
}

export type TournamentRulesConfig = TournamentRulesConfigV1;

export type StageRulesV1 =
  RoundRobinStageRulesV1 | GroupStageRulesV1 | KnockoutStageRulesV1;

interface StageRulesBaseV1 {
  stageKey: string;
  match: MatchRulesV1;
  discipline: DisciplineRulesV1;
}

export interface RoundRobinStageRulesV1 extends StageRulesBaseV1 {
  type: 'round_robin';
  schedule: RoundRobinScheduleRuleV1;
  scoring: ScoringRuleV1;
  standings: StandingsRuleV1;
}

export interface GroupStageRulesV1 extends StageRulesBaseV1 {
  type: 'group_stage';
  groups: { count: number } & (
    | { teamsPerGroup: number; groupSizes?: never }
    | { groupSizes: number[]; teamsPerGroup?: never }
  );
  schedule: RoundRobinScheduleRuleV1;
  scoring: ScoringRuleV1;
  standings: StandingsRuleV1;
}

export interface KnockoutStageRulesV1 extends StageRulesBaseV1 {
  type: 'knockout';
  bracket: BracketRuleV1;
}

export interface RoundRobinScheduleRuleV1 {
  algorithm: 'circle';
  legs: 1 | 2 | 3 | 4;
  balanceHomeAway: boolean;
}

export interface ScoringRuleV1 {
  win: number;
  draw: number;
  loss: number;
  technicalWin?: number;
  technicalLoss?: number;
}

export interface StandingsRuleV1 {
  tieBreakers: TieBreakerRuleV1[];
  disciplinaryScore?: {
    yellowCard: number;
    secondYellowCard: number;
    redCard: number;
  };
}

export type TieBreakerRuleV1 =
  | { type: 'points'; scope: 'all_matches' }
  | {
      type: 'head_to_head';
      metrics: HeadToHeadMetricV1[];
      reapplyAfterReduction: boolean;
    }
  | { type: 'wins'; scope: 'all_matches' }
  | { type: 'goal_difference'; scope: 'all_matches' }
  | { type: 'goals_for'; scope: 'all_matches' }
  | { type: 'goals_against'; scope: 'all_matches'; order: 'asc' }
  | { type: 'disciplinary_score'; order: 'asc' }
  | { type: 'technical_loss'; order: 'asc' }
  | { type: 'manual_decision' }
  | { type: 'draw' }
  | { type: 'draw_lots' };

export type HeadToHeadMetricV1 =
  'points' | 'wins' | 'goal_difference' | 'goals_for';

export interface StageTransitionRuleV1 {
  fromStageKey: string;
  toStageKey: string;
  qualification: QualificationRuleV1[];
  crossGroupComparison?: CrossGroupComparisonRuleV1;
  confirmationRequired: true;
}

export type CrossGroupComparisonRuleV1 = {
  unequalGroups: {
    type: 'exclude_matches_against_last_placed';
  };
};

export type QualificationRuleV1 =
  | { id: string; type: 'top_n_per_group'; positions: number[] }
  | { id: string; type: 'group_winners' }
  | {
      id: string;
      type: 'best_placed_teams_between_groups';
      sourcePosition: number;
      count: number;
      ranking: CrossGroupRankingRuleV1;
    }
  | {
      /** @deprecated Use best_placed_teams_between_groups. */
      id: string;
      type: 'best_placed_between_groups';
      sourcePosition: number;
      count: number;
      ranking: CrossGroupRankingRuleV1;
    }
  | {
      id: string;
      type: 'overall_ranking';
      count: number;
      ranking: CrossGroupRankingRuleV1;
    }
  | { id: string; type: 'manual_selection'; count: number };

export interface CrossGroupRankingRuleV1 {
  criteria: CrossGroupCriterionV1[];
}

export type CrossGroupCriterionV1 =
  | 'points'
  | 'wins'
  | 'goal_difference'
  | 'goals_for'
  | 'goals_against_asc'
  | 'disciplinary_score_asc'
  | 'draw_lots';

export interface BracketRuleV1 {
  size: 2 | 4 | 8 | 16 | 32;
  placementMatch?: 'third_place';
  seeding: SeedingRuleV1;
}

export type SeedingRuleV1 =
  | {
      type: 'standard';
      ranking: CrossGroupRankingRuleV1;
      constraints?: PairingConstraintV1[];
    }
  | { type: 'random_draw'; constraints?: PairingConstraintV1[] }
  | { type: 'manual'; constraints?: PairingConstraintV1[] }
  | {
      type: 'best_eligible_opponent';
      protectedQualificationRuleId: string;
      candidateQualificationRuleId: string;
      candidateRanking: CrossGroupRankingRuleV1;
      constraints: PairingConstraintV1[];
      remaining: 'pair_in_ranking_order';
    };

export type PairingConstraintV1 = {
  type: 'avoid_same_source_group';
  mode: 'required' | 'best_effort';
};

export type KnockoutParticipantSourceV1 =
  | {
      type: 'team';
      tournamentTeamId: number;
      teamId: number;
    }
  | {
      type: 'qualification_position';
      qualificationSnapshotId: number;
      qualificationEntryId: number;
      selectionOrder: number;
      tournamentTeamId: number;
      teamId: number;
    }
  | {
      type: 'match_outcome';
      bracketPosition: string;
      outcome: 'winner' | 'loser';
    };

export interface MatchRulesV1 {
  periods: number;
  periodDurationMinutes: number | null;
  allowDraw: boolean;
  extraTime: ExtraTimeRuleV1;
  penalties: PenaltyShootoutRuleV1;
}

export type ExtraTimeRuleV1 =
  | { enabled: false }
  | { enabled: true; periods: number; periodDurationMinutes: number };

export type PenaltyShootoutRuleV1 =
  | { enabled: false }
  | { enabled: true; initialKicksPerTeam: number; suddenDeath: true };

export interface DisciplineRulesV1 {
  accumulatedYellows: AccumulatedYellowRuleV1 | { enabled: false };
  secondYellowInMatch: SuspensionRuleV1 | { enabled: false };
  directRed: SuspensionRuleV1 | { enabled: false };
  stageTransition: DisciplineTransitionRuleV1;
}

export interface AccumulatedYellowRuleV1 {
  enabled: true;
  threshold: number;
  suspensionMatches: number;
  progression:
    | 'reset_after_suspension'
    | 'every_card_after_threshold'
    | 'repeat_every_threshold';
}

export interface SuspensionRuleV1 {
  enabled: true;
  minimumMatches: number;
  allowManualExtension: boolean;
}

export interface DisciplineTransitionRuleV1 {
  carryYellowCards: boolean;
  carryPendingSuspensions: boolean;
}
