export interface PlayoffStanding {
    tournamentTeamId: number;
    team: {
        id: number;
        name: string;
        logoUrl?: string | null;
    };
    position: number;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
}

export interface PlayoffLaunchState {
    tournament: { id: number; name: string };
    groupStage: {
        id: number;
        name: string;
        allMatchesFinished: boolean;
        unfinishedMatches: number;
        standingsReady: boolean;
    };
    knockoutStage: {
        id: number;
        name: string;
        bracketSize: number;
        expectedMatches: Array<{
            bracketPosition: string;
            label: string;
        }>;
    };
    groups: Array<{
        id: number;
        name: string;
        standings: PlayoffStanding[];
    }>;
    suggestedTournamentTeamIds: number[];
    suggestionError?: string;
    venues: Array<{ id: number; name: string; address?: string }>;
    launched: boolean;
    matches: Array<{
        id?: number;
        bracketPosition: string;
        homeTeamName?: string;
        awayTeamName?: string;
        matchDatetime?: string;
        venueName?: string;
    }>;
}

export interface PlayoffLaunchPayload {
    selectedTournamentTeamIds: number[];
    manualPairs: Array<{
        homeTournamentTeamId: number;
        awayTournamentTeamId: number;
    }>;
    schedule: Array<{
        bracketPosition: string;
        matchDatetime: string;
        venueId: number;
    }>;
}
