export class MatchRosterTeamDto {
  id: number;
  name: string;
  logoUrl?: string;
  rosterApproved: boolean;
}

export class MatchRosterCheckDto {
  match: {
    id: number;
    matchDatetime?: Date;
    venueName?: string;
    homeTeam: MatchRosterTeamDto;
    awayTeam: MatchRosterTeamDto;
  };
  warnings: {
    yellowCardsOverflowCount: number;
    redCardCount: number;
  };
  homeRoster: MatchRosterPlayerDto[];
  awayRoster: MatchRosterPlayerDto[];
}

export type PlayerEligibilityStatus = 'allowed' | 'check' | 'not_allowed';

export type PlayerEligibilityReason =
  | 'none'
  | 'three_yellows'
  | 'four_yellows_suspension'
  | 'red_card_suspension'
  | 'second_yellow_suspension';

export class MatchRosterPlayerDto {
  id: number;
  firstName: string;
  lastName: string;
  middleName?: string;
  photoUrl?: string;
  shirtNumber?: number;
  position?: string;
  isCaptain: boolean;
  yellowCards: number;
  redCards: number;
  secondYellowCards: number;
  eligibilityStatus: PlayerEligibilityStatus;
  eligibilityReason: PlayerEligibilityReason;
}
