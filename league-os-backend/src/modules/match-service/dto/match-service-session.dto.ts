import { MatchStatus } from '../../matches/enums/match-status.enum';
import { MatchServiceStatus } from '../enums/match-service-status.enum';
import { MatchEventType } from '../../match-events/enums/match-event-type.enum';
import { RedBallStatus } from '../entities/match-red-ball-activation.entity';
import { MatchResolutionType } from '../../matches/enums/match-resolution-type.enum';

export interface MatchServiceSessionDto {
  match: {
    id: number;
    tournamentId: number;
    round?: string;
    status: MatchStatus;
    matchDatetime?: Date;
    result: {
      regularTime: { home: number; away: number };
      extraTime?: { home: number; away: number };
      penalties?: {
        home: number;
        away: number;
        homeKicksTaken: number;
        awayKicksTaken: number;
      };
      resolutionType?: MatchResolutionType;
      winnerTeamId?: number;
      officialAt?: Date;
    };

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
  };

  session: {
    id: number;
    matchId: number;
    status: MatchServiceStatus;
    previousStatus?: MatchServiceStatus | null;
    currentHalf: number;
    elapsedSeconds: number;
    startedAt?: Date | null;
    pausedAt?: Date | null;
    finishedAt?: Date | null;
    homeScore: number;
    awayScore: number;
  };

  rosters: {
    home: MatchServiceRosterPlayerDto[];
    away: MatchServiceRosterPlayerDto[];
  };

  events: MatchServiceEventDto[];

  redBalls: MatchServiceRedBallStateDto;
}

export interface MatchServiceRosterPlayerDto {
  id: number;
  matchRosterPlayerId: number;
  teamPlayerId?: number;
  firstName: string;
  lastName: string;
  middleName?: string;
  shirtNumber?: number;
  isCaptain: boolean;
}

export interface MatchServiceEventDto {
  id: number;
  clientEventId?: string;
  eventType: MatchEventType;
  matchId: number;
  teamId: number;
  playerId?: number;
  assistPlayerId?: number;
  secondaryPlayerId?: number;
  half?: number;
  second?: number;
  minute?: number;
  addedMinute?: number;
  description?: string;
  isCancelled: boolean;

  team?: {
    id: number;
    name: string;
    shortName?: string;
  };

  player?: {
    id: number;
    firstName: string;
    lastName: string;
    shirtNumber?: number;
  };

  assistPlayer?: {
    id: number;
    firstName: string;
    lastName: string;
    shirtNumber?: number;
  };
}

export interface MatchServiceRedBallDto {
  id: number;
  teamId: number;
  activatedHalf: number;
  activatedSecond: number;
  durationSeconds: number;
  status: RedBallStatus;
}

export interface MatchServiceRedBallStateDto {
  active: MatchServiceRedBallDto[];
  usedTeamIds: number[];
}
