import type { MatchStatus } from '../../matches/enums/match-status.enum';
import type { TieBreakerRuleV1 } from '../../tournament-rules/types/tournament-rules-config.type';
import type { TieBreakReason } from './tie-break-reason.type';

export interface StandingsMatchInput {
  id?: number;
  stageId?: number;
  groupId?: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
}

export interface StandingsDisciplinaryEventInput {
  teamId: number;
  eventType: 'yellow_card' | 'second_yellow_card' | 'red_card';
}

export interface StandingsScoringInput {
  win: number;
  draw: number;
  loss: number;
}

export interface StandingsEngineInput {
  teamIds: number[];
  matches: StandingsMatchInput[];
  scoring: StandingsScoringInput;
  tieBreakers: TieBreakerRuleV1[];
  disciplinaryEvents?: StandingsDisciplinaryEventInput[];
  disciplinaryWeights?: {
    yellowCard: number;
    secondYellowCard: number;
    redCard: number;
  };
  manualDecisionRanks?: Map<number, number>;
  drawRanks?: Map<number, number>;
  drawSeed: number;
}

export interface CalculatedStandingRow {
  position: number;
  teamId: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  disciplinaryScore: number;
  manualDecisionRank?: number;
  drawRank: number;
  tieBreakReason?: TieBreakReason;
}
