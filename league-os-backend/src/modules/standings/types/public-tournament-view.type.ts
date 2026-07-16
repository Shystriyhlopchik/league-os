import type { MatchResolutionType } from '../../matches/enums/match-resolution-type.enum';
import type { MatchRoundType } from '../../matches/enums/match-round-type.enum';
import type { MatchStatus } from '../../matches/enums/match-status.enum';
import type { TournamentStageStatus } from '../../tournament-stages/enums/tournament-stage-status.enum';
import type { TournamentStageType } from '../../tournament-stages/enums/tournament-stage-type.enum';
import type { TieBreakReason } from './tie-break-reason.type';

export type PublicQualificationStatus =
  | 'qualified'
  | 'best_placed'
  | 'not_qualified'
  | 'pending'
  | 'not_applicable';

export interface PublicStandingRow {
  position: number;
  team: {
    id: number;
    name: string;
    shortName?: string;
    logoUrl?: string;
  };
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  disciplinaryScore: number;
  qualificationStatus: PublicQualificationStatus;
  placementReason: {
    type: 'qualification' | 'tie_break' | 'position' | 'pending';
    title: string;
    description: string;
    tieBreak?: TieBreakReason;
  };
}

export interface PublicGroupView {
  id: number;
  key: string;
  name: string;
  order: number;
  standings: PublicStandingRow[];
}

export interface PublicCrossGroupRanking {
  id: string;
  title: string;
  sourcePosition: number;
  criteria: string[];
  rows: Array<
    PublicStandingRow & {
      sourceGroup: { id: number; key: string; name: string };
      crossGroupPosition: number;
    }
  >;
}

export interface PublicBracketMatch {
  id?: number;
  position: string;
  roundType: MatchRoundType;
  roundNumber: number;
  status: MatchStatus | 'pending';
  homeTeam?: PublicStandingRow['team'];
  awayTeam?: PublicStandingRow['team'];
  homeSourceLabel: string;
  awaySourceLabel: string;
  regularTime?: { home: number; away: number };
  extraTime?: { home: number; away: number };
  penalties?: {
    home: number;
    away: number;
    homeKicksTaken?: number;
    awayKicksTaken?: number;
  };
  resolutionType?: MatchResolutionType;
  winnerTeamId?: number;
  administrativeDecision?: {
    type: 'technical_result' | 'walkover';
    label: string;
  };
}

export interface PublicTournamentStageView {
  id: number | null;
  key: string;
  name: string;
  type: TournamentStageType;
  order: number;
  status: TournamentStageStatus | 'legacy';
  startDate?: string;
  endDate?: string;
  groups: PublicGroupView[];
  standings: PublicStandingRow[];
  crossGroupRankings: PublicCrossGroupRanking[];
  bracket: {
    confirmed: boolean;
    matches: PublicBracketMatch[];
  };
  empty: boolean;
}

export interface PublicTournamentView {
  tournament: {
    id: number;
    name: string;
    description?: string;
    logoUrl?: string;
    colorPrimary?: string;
    lifecycleStatus?: string;
  };
  activeStageId: number | null;
  stages: PublicTournamentStageView[];
}
