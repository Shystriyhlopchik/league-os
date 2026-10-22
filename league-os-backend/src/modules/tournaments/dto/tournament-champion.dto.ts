import { PlayerPosition } from '../../players/enums/player-position.enum';

export interface TournamentChampionPlayerDto {
  id: number;
  name: string;
  photoUrl: string | null;
  shirtNumber: number | null;
  position: PlayerPosition | null;
  appearances: number;
}

export interface TournamentChampionDto {
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
      matchDatetime: Date | null;
      homeScore: number;
      awayScore: number;
      penaltyHomeScore: number | null;
      penaltyAwayScore: number | null;
    };
    players: TournamentChampionPlayerDto[];
  } | null;
}
