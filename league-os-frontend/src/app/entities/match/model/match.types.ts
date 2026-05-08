import {Competition} from '../../competition/model/competition.model';

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

export interface MatchTeam {
    id: number;
    name: string;
    shortName: string;
    logoUrl: string | null;
}

export interface MatchScore {
    home: number | null;
    away: number | null;
}

export interface MatchVenue {
    id: number;
    name: string;
}

export interface Match {
    id: number;
    tournamentId: number;
    round: string;
    status: MatchStatus;
    matchDateTime: string;
    homeTeam: MatchTeam;
    awayTeam: MatchTeam;
    score: MatchScore;
    venue: MatchVenue | null;
    tournament: Tournament
}

export interface Tournament {
    id: number;
    name: string;
    competition: Competition;
    season: Season;
}

export interface Season {
    id: number;
    name: string;
    year: number;
}
