import type {
  CrossGroupCriterionV1,
  QualificationRuleV1,
} from '../../tournament-rules/types/tournament-rules-config.type';

export interface QualificationStandingInput {
  tournamentTeamId: number;
  teamId: number;
  groupId?: number;
  groupOrder: number;
  position: number;
  points: number;
  wins: number;
  goalDifference: number;
  goalsFor: number;
  goalsAgainst: number;
  disciplinaryScore: number;
}

export interface QualificationResolutionInput {
  manualSelections: Array<{
    qualificationRuleId: string;
    tournamentTeamIds: number[];
  }>;
  drawResults: Array<{
    qualificationRuleId: string;
    tournamentTeamId: number;
    rank: number;
  }>;
}

export interface QualificationEngineInput {
  rules: QualificationRuleV1[];
  standings: QualificationStandingInput[];
  resolutions: QualificationResolutionInput;
}

export interface QualificationSelectionReason {
  strategy: QualificationRuleV1['type'];
  criteria?: CrossGroupCriterionV1[];
  values?: Record<string, number>;
  description: string;
}

export interface QualificationSelection {
  tournamentTeamId: number;
  teamId: number;
  sourceGroupId?: number;
  sourcePosition: number;
  qualificationRuleId: string;
  selectionOrder: number;
  comparisonSnapshot: Record<string, number>;
  reason: QualificationSelectionReason;
}
