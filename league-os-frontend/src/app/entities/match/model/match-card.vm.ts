import { MatchStatus } from './match.types';

export interface MatchCardVm {
    id: number;
    round: string;
    status: MatchStatus;
    matchDateTime: string | Date;

    homeTeamId: number;
    homeTeamName: string;
    homeTeamLogoUrl: string;
    homeTeamScore: number | null;

    awayTeamId: number;
    awayTeamName: string;
    awayTeamLogoUrl: string;
    awayTeamScore: number | null;

    venueName: string | null;

    competitionLogoUrl?: string | null;
    competitionName: string;

    seasonYear: number;
}
