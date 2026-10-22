export interface StatsSummaryData {
    tournamentId: number;
    groupId?: number;
    seasonId: number;
    competitionId: number;
    year: number;
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
