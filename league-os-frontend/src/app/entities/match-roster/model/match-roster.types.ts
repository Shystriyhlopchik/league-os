export interface MatchRosterCheck {
    match: MatchRosterCheckMatch;
    warnings: MatchRosterWarnings;
    homeRoster: MatchRosterPlayer[];
    awayRoster: MatchRosterPlayer[];
}

export interface MatchRosterWarnings {
    totalWarningsCount: number;
    playersToCheckCount: number;
    yellowCardsSuspensionCount: number;
    redCardSuspensionCount: number;
}

export interface MatchRosterCheckMatch {
    id: number;
    status: 'scheduled' | 'live' | 'finished' | 'cancelled';
    homeScore: number;
    awayScore: number;
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

export interface MatchRosterPlayer {
    id: number;
    teamPlayerId: number;

    firstName: string;
    lastName: string;
    middleName?: string;

    photoUrl?: string;
    shirtNumber?: number;
    position?: string;
    isCaptain: boolean;

    yellowCards: number;
    redCards: number;
    secondYellowCards: number;

    eligibilityStatus: PlayerEligibilityStatus;
    eligibilityReason: PlayerEligibilityReason;
}

export type PlayerEligibilityStatus = 'allowed' | 'check' | 'not_allowed';

export type PlayerEligibilityReason =
    | 'none'
    | 'three_yellows'
    | 'four_yellows_suspension'
    | 'red_card_suspension'
    | 'second_yellow_suspension';
