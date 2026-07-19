import { MatchStatus } from './match.types';

export interface MatchProtocol {
    match: MatchProtocolMatch;
    officials: MatchProtocolOfficial[];
    events: MatchProtocolEvent[];
    rosters: MatchProtocolRosters;
}

export interface MatchProtocolMatch {
    id: number;
    status: MatchStatus;
    round: string | null;
    matchDateTime: string;

    tournament: MatchProtocolTournament;
    venue: MatchProtocolVenue | null;

    homeTeam: MatchProtocolTeamWithScore;
    awayTeam: MatchProtocolTeamWithScore;
}

export interface MatchProtocolTournament {
    id: number;
    name: string;
    logoUrl: string | null;
    season: {
        id: number;
        name: string;
        year: number;
    };
    competition: {
        id: number;
        name: string;
        logoUrl: string | null;
    };
}

export interface MatchProtocolVenue {
    id: number;
    name: string;
}

export interface MatchProtocolTeam {
    id: number;
    name: string;
    shortName: string;
    logoUrl?: string | null;
}

export interface MatchProtocolTeamWithScore extends MatchProtocolTeam {
    score: number | null;
}

export interface MatchProtocolOfficial {
    id: number;
    fullName: string;
    role: string;
}

export interface MatchProtocolEvent {
    id: number;
    type: MatchProtocolEventType;

    minute: number | null;
    addedMinute: number | null;
    half: number | null;
    second: number | null;

    team: MatchProtocolTeam | null;
    player: MatchProtocolPlayer | null;
    assistPlayer: MatchProtocolPlayer | null;
    secondaryPlayer: MatchProtocolPlayer | null;

    description: string | null;
}

export type MatchProtocolEventType =
    | 'goal'
    | 'own_goal'
    | 'yellow_card'
    | 'red_card'
    | 'second_yellow'
    | 'penalty'
    | 'goal_cancelled'
    | 'match_started'
    | 'match_paused'
    | 'half_finished'
    | 'match_finished'
    | string;

export interface MatchProtocolPlayer {
    id: number;
    firstName: string;
    lastName: string;
    middleName: string | null;
}

export interface MatchProtocolRosters {
    home: MatchProtocolRosterPlayer[];
    away: MatchProtocolRosterPlayer[];
}

export interface MatchProtocolRosterPlayer {
    id: number;
    matchRosterPlayerId: number;
    teamPlayerId: number | null;

    firstName: string;
    lastName: string;
    middleName: string | null;
    photoUrl: string | null;

    shirtNumber: number | null;
    position: string | null;

    isCaptain: boolean;
    wasAllowed: boolean;
}
