export interface Tournament {
    id: number;

    name: string;
    slug: string;

    description?: string;

    type: TournamentType;
    format: TournamentFormat;
    status: TournamentStatus;

    startDate?: string;
    endDate?: string;

    logoUrl?: string | null;

    season: TournamentSeason;

    competition: TournamentCompetition;
    colorPrimary: string;
}

export interface TournamentSeason {
    id: number;

    name: string;

    year: number;
}

export interface TournamentCompetition {
    id: number;

    name: string;
    slug: string;

    logoUrl?: string | null;

    colorPrimary?: string | null;
}

export enum TournamentType {
    LEAGUE = 'league',
    CUP = 'cup',
    FRIENDLY = 'friendly',
}

export enum TournamentStatus {
    PLANNED = 'planned',
    ACTIVE = 'active',
    FINISHED = 'finished',
    CANCELLED = 'cancelled',
}

export enum TournamentFormat {
    ROUND_ROBIN = 'round_robin',
    KNOCKOUT = 'knockout',
    MIXED = 'mixed',
    FINAL = 'final',
}
