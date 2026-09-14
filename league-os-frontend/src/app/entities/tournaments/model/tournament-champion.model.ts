export interface TournamentChampionPlayer {
    id: number;
    name: string;
    photoUrl: string | null;
    shirtNumber: number | null;
    position: 'goalkeeper' | 'defender' | 'winger' | 'forward' | null;
    appearances: number;
}

export interface TournamentChampion {
    tournament: {
        id: number;
        name: string;
    };
    season: {
        id: number;
        name: string;
        year: number | null;
    };
    champion: {
        team: {
            id: number;
            name: string;
            shortName: string | null;
            logoUrl: string | null;
            primaryColor: string | null;
            secondaryColor: string | null;
        };
        final: {
            matchId: number;
            matchDatetime: string | null;
            homeScore: number;
            awayScore: number;
            penaltyHomeScore: number | null;
            penaltyAwayScore: number | null;
        };
        players: TournamentChampionPlayer[];
    } | null;
}
