export interface StandingRow {
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
    disciplinaryScore?: number;
    qualificationStatus?:
        | 'qualified'
        | 'best_placed'
        | 'not_qualified'
        | 'pending'
        | 'not_applicable';
    placementReason?: {
        type: 'qualification' | 'tie_break' | 'position' | 'pending';
        title: string;
        description: string;
        tieBreak?: {
            criterion: string;
            comparedTeamIds: number[];
            value: number | Record<string, number>;
            description: string;
        };
    };
}
