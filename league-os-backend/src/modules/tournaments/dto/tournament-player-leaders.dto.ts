export type PlayerLeaderboardMetric =
  | 'goals'
  | 'assists'
  | 'yellowCards'
  | 'redCards'
  | 'goalContributions'
  | 'goalsPerGame';

export interface PlayerLeaderboardEntryDto {
  position: number;
  value: number;
  player: {
    id: number;
    name: string;
    photoUrl: string | null;
  };
  team: {
    id: number;
    name: string;
    logoUrl: string | null;
  };
}

export interface TournamentPlayerLeadersDto {
  tournamentId: number;
  groupId?: number;
  leaderboards: Record<PlayerLeaderboardMetric, PlayerLeaderboardEntryDto[]>;
}
