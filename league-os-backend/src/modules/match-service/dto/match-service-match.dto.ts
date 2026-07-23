import { MatchStatus } from '../../matches/enums/match-status.enum';

export interface MatchServiceMatchDto {
    id: number;
    tournamentId: number;
    round?: string;
    matchDatetime?: string;
    status: MatchStatus;

    homeTeam: {
        id: number;
        name: string;
        shortName?: string;
        logoUrl?: string;
    };

    awayTeam: {
        id: number;
        name: string;
        shortName?: string;
        logoUrl?: string;
    };

    venue?: {
        id: number;
        name: string;
    };
}
