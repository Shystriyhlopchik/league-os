export interface TournamentStatsSummaryDto {
  tournamentId: number;
  groupId?: number;
  seasonId: number;
  competitionId: number;
  year: number | null;
  played: number;
  wins: number;
  draws: number;
  remaining: number;
  penalties: number;
  assists: number;
  goals: number;
  yellowCards: number;
  redCards: number;
}
