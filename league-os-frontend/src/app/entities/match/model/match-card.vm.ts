export interface MatchCardVm {
    id: number | string;
    competitionName: string,
    competitionLogoUrl: string,
    seasonYear: number;
    roundNumber: number | string;
    matchDateTime: string | Date;

    homeTeamName: string;
    homeTeamLogoUrl: string;
    homeTeamScore?: number | null;

    awayTeamName: string;
    awayTeamLogoUrl: string;
    awayTeamScore?: number | null;

    venueName?: string | null;
}
