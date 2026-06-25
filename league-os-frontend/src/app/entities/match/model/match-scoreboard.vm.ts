import { MatchStatus } from './match.types';

export interface MatchScoreboardVm {
    competitionLogoUrl?: string | null;
    tournamentName: string;

    seasonName?: string | null;
    round?: string | null;
    matchDateTime?: string | null;
    status: MatchStatus;

    homeTeam: MatchScoreboardTeamVm;
    awayTeam: MatchScoreboardTeamVm;

    homeScore?: number | null;
    awayScore?: number | null;

    venueName?: string | null;
}

export interface MatchScoreboardTeamVm {
    id: number;
    name: string;
    shortName?: string | null;
    logoUrl?: string | null;
}
