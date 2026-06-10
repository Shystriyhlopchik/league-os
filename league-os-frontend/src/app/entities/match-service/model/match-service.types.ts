import {MatchStatus} from '../../match/model/match.types';

export interface MatchServiceMatch {
    id: number;
    tournamentId: number;
    round?: string;
    matchDatetime?: string;
    status: MatchStatus;
    homeTeam: MatchServiceTeam;
    awayTeam: MatchServiceTeam;
    venue?: MatchServiceVenue;
}

export interface MatchServiceTeam {
    id: number;
    name: string;
    logoUrl?: string;
}

export interface MatchServiceVenue {
    id: number;
    name: string;
}

export type MatchServiceStatus =
    | 'not_started'
    | 'roster_check'
    | 'rosters_approved'
    | 'in_progress'
    | 'finished';
