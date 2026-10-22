export type PlayerCardPositionCode = 'GK' | 'DF' | 'MF' | 'FW' | '—';

export interface PlayerCardRatingsDto {
  ovr: number;
  att: number;
  cre: number;
  form: number;
  exp: number;
  disc: number;
  imp: number;
}

export interface PlayerCardStatsDto {
  matches: number;
  goals: number;
  assists: number;
  goalContributions: number;
  goalsPerMatch: number;
  assistsPerMatch: number;
  goalContributionsPerMatch: number;
  recentGoalContributions: number;
  yellowCards: number;
  secondYellowCards: number;
  redCards: number;
  suspensions: number;
}

export interface PlayerCardDto {
  playerId: number;
  name: string;
  photoUrl: string | null;
  position: PlayerCardPositionCode;
  positionName: string;
  team: {
    id: number;
    name: string;
    logoUrl: string | null;
  };
  shirtNumber: number | null;
  preferredFoot: 'left' | 'right' | 'both' | null;
  preferredFootName: string;
  hasLimitedData: boolean;
  ratings: PlayerCardRatingsDto;
  stats: PlayerCardStatsDto;
}

export interface TournamentPlayerCardsDto {
  tournamentId: number;
  tournamentName: string;
  ratingVersion: 1;
  players: PlayerCardDto[];
}
