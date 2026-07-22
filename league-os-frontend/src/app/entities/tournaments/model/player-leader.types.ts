export const PLAYER_LEADERBOARD_METRICS = [
    'goals',
    'assists',
    'yellowCards',
    'redCards',
    'goalContributions',
    'goalsPerGame',
] as const;

export type PlayerLeaderboardMetric =
    (typeof PLAYER_LEADERBOARD_METRICS)[number];

export interface PlayerLeaderboardEntry {
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

export type PlayerLeaderboards = Record<
    PlayerLeaderboardMetric,
    PlayerLeaderboardEntry[]
>;

export interface TournamentPlayerLeadersResponse {
    tournamentId: number;
    groupId?: number;
    leaderboards: PlayerLeaderboards;
}
