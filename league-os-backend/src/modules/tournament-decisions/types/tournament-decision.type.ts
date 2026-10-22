import type { TournamentDecisionEntityType } from '../enums/tournament-decision-entity-type.enum';

export interface TournamentDecisionAffectedEntity {
  entityType: TournamentDecisionEntityType;
  entityId: number;
}

export type TournamentDecisionValues =
  | TechnicalResultDecisionValues
  | ResultAnnulmentDecisionValues
  | PointsDeductionDecisionValues
  | RankingDecisionValues
  | SuspensionExtensionDecisionValues
  | SuspensionCancellationDecisionValues
  | QualificationOverrideDecisionValues
  | Record<string, never>;

export interface TechnicalResultDecisionValues {
  matchId: number;
  winnerTeamId: number;
  loserTeamId: number;
}

export interface ResultAnnulmentDecisionValues {
  matchId: number;
}

export interface PointsDeductionDecisionValues {
  stageId: number;
  groupId?: number;
  teamId: number;
  points: number;
}

export interface RankingDecisionValues {
  stageId: number;
  groupId?: number;
  ranks: Array<{ teamId: number; rank: number }>;
}

export interface SuspensionExtensionDecisionValues {
  suspensionId: number;
  extraMatches: number;
}

export interface SuspensionCancellationDecisionValues {
  suspensionId: number;
}

export interface QualificationOverrideDecisionValues {
  fromStageId: number;
  toStageId: number;
  tournamentTeamIds: number[];
}
