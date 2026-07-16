import type { MatchRoundType } from '../../matches/enums/match-round-type.enum';
import type {
  BracketRuleV1,
  KnockoutParticipantSourceV1,
} from '../../tournament-rules/types/tournament-rules-config.type';

export interface KnockoutQualifierInput {
  qualificationEntryId: number;
  qualificationSnapshotId: number;
  tournamentTeamId: number;
  teamId: number;
  selectionOrder: number;
  qualificationRuleId: string;
  sourceGroupId?: number;
  comparisonSnapshot: Record<string, number>;
}

export interface KnockoutSeedingInput {
  randomSeed?: number;
  manualPairs: Array<{
    homeTournamentTeamId: number;
    awayTournamentTeamId: number;
  }>;
  drawResults: Array<{ tournamentTeamId: number; rank: number }>;
}

export interface KnockoutBracketEngineInput {
  bracket: BracketRuleV1;
  qualificationSnapshotId: number;
  qualifiers: KnockoutQualifierInput[];
  seedingInput: KnockoutSeedingInput;
}

export interface KnockoutMatchPlan {
  order: number;
  bracketPosition: string;
  roundType: MatchRoundType;
  roundNumber: number;
  homeSource: KnockoutParticipantSourceV1;
  awaySource: KnockoutParticipantSourceV1;
  resolvedHomeTeamId?: number;
  resolvedAwayTeamId?: number;
}
