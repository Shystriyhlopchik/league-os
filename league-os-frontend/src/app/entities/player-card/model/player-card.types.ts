export type PlayerCardPosition = 'GK' | 'DF' | 'MF' | 'FW' | '—';

export interface PlayerCardRatings {
    ovr: number;
    att: number;
    cre: number;
    form: number;
    exp: number;
    disc: number;
    imp: number;
}

export interface PlayerCardStats {
    matches: number;
    goals: number;
    assists: number;
    goalContributions: number;
    goalsPerMatch: number;
    assistsPerMatch: number;
    goalContributionsPerMatch: number;
    recentGoalContributions: number;
    yellowCards: number;
    secondYellowCards: number;
    redCards: number;
    suspensions: number;
}

export interface PlayerCard {
    playerId: number;
    name: string;
    photoUrl: string | null;
    position: PlayerCardPosition;
    positionName: string;
    team: {
        id: number;
        name: string;
        logoUrl: string | null;
    };
    shirtNumber: number | null;
    preferredFoot: 'left' | 'right' | 'both' | null;
    preferredFootName: string;
    hasLimitedData: boolean;
    ratings: PlayerCardRatings;
    stats: PlayerCardStats;
}

export interface TournamentPlayerCards {
    tournamentId: number;
    tournamentName: string;
    ratingVersion: 1;
    players: PlayerCard[];
}
