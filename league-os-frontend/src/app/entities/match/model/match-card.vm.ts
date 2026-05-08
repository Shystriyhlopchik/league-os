export interface MatchCardVm {
    id: number;
    round: string;
    status: string;
    matchDateTime: string | Date;

    homeTeamName: string;
    homeTeamLogoUrl: string;
    homeTeamScore: number | null;

    awayTeamName: string;
    awayTeamLogoUrl: string;
    awayTeamScore: number | null;

    venueName: string | null;

    competitionLogoUrl: string;
    competitionName: string;

    seasonYear: number;
}
