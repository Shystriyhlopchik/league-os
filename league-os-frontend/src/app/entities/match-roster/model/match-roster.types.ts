export interface MatchRosterCheck {
    match: MatchRosterCheckMatch;
    warnings: MatchRosterWarnings;
    homeRoster: MatchRosterPlayer[];
    awayRoster: MatchRosterPlayer[];
}

export interface MatchRosterCheckMatch {
    id: number;
    matchDatetime?: string;
    venueName?: string;
    homeTeam: MatchRosterTeam;
    awayTeam: MatchRosterTeam;
}

export interface MatchRosterTeam {
    id: number;
    name: string;
    logoUrl?: string;
    rosterApproved: boolean;
}

export interface MatchRosterWarnings {
    yellowCardsOverflowCount: number;
    redCardCount: number;
}

export interface MatchRosterPlayer {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string;
    photoUrl?: string;
    shirtNumber?: number;
    position?: string;
    isCaptain: boolean;
    eligibilityStatus: PlayerEligibilityStatus;
}

export type PlayerEligibilityStatus = 'allowed' | 'check' | 'not_allowed';
