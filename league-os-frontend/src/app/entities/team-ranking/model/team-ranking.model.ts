export type TeamRankingMode = 'current' | 'historical';

export type TeamRatingResult =
    | 'champion'
    | 'finalist'
    | 'third'
    | 'fourth'
    | 'playoff'
    | 'participation';

export interface TournamentRatingBreakdown {
    tournament: { id: number; name: string };
    result: TeamRatingResult;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    performancePoints: number;
    placeBonus: number;
    tournamentCoefficient: number;
    pointsBeforeLoyalty: number;
}

export interface TeamSeasonRatingBreakdown {
    season: { id: number; name: string; year?: number };
    loyaltyStreak: number;
    loyaltyBonus: number;
    seasonPoints: number;
    weight: number;
    weightedPoints: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    tournaments: TournamentRatingBreakdown[];
}

export interface TeamRankingRow {
    position: number;
    team: {
        id: number;
        name: string;
        slug: string;
        logoUrl?: string;
    };
    points: number;
    goalDifference: number;
    goalsFor: number;
    seasonsPlayed: number;
    seasonBreakdown: TeamSeasonRatingBreakdown[];
}

export interface TeamRankingResponse {
    mode: TeamRankingMode;
    generatedAt: string;
    competition: { id: number; name: string; slug: string };
    seasonWeights: Array<{
        seasonId: number;
        seasonName: string;
        seasonYear?: number;
        weight: number;
    }>;
    rankings: TeamRankingRow[];
}
