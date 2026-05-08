export interface StandingRow {
    position: number;
    team: {
        id: number;
        name: string;
        logoUrl: string;
    };
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
}
