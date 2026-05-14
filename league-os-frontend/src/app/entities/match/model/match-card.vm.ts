import {MatchStatus} from './match.types';

export interface MatchCardVm {
    id: number;
    round: string;
    status: MatchStatus;
    matchDateTime: string | Date;

    homeTeamName: string;
    homeTeamLogoUrl: string;
    homeTeamScore: number | null;

    awayTeamName: string;
    awayTeamLogoUrl: string;
    awayTeamScore: number | null;

    venueName: string | null;

    competitionLogoUrl?: string | null;
    competitionName: string;

    seasonYear: number;
}
