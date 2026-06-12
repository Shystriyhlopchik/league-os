import { MatchStatus } from '../../match/model/match.types';

export interface MatchServiceMatch {
    id: number;
    tournamentId: number;
    round?: string;
    matchDatetime?: string;
    status: MatchStatus;
    homeTeam: MatchServiceTeam;
    awayTeam: MatchServiceTeam;
    venue?: MatchServiceVenue;
}

export interface MatchServiceTeam {
    id: number;
    name: string;
    shortName?: string;
    logoUrl?: string;
}

export interface MatchServiceVenue {
    id: number;
    name: string;
}

export type MatchServiceStatus =
    | 'not_started'
    | 'first_half'
    | 'half_time'
    | 'second_half'
    | 'paused'
    | 'event_recording'
    | 'finished'
    | 'protocol_signed';

export type MatchEventType =
    | 'goal'
    | 'own_goal'
    | 'yellow_card'
    | 'second_yellow_card'
    | 'red_card'
    | 'red_ball';

export interface MatchServiceSession {
    id: number;
    matchId: number;
    status: MatchServiceStatus;
    previousStatus?: MatchServiceStatus | null;
    currentHalf: number;
    elapsedSeconds: number;
    startedAt?: string | null;
    pausedAt?: string | null;
    finishedAt?: string | null;
    homeScore: number;
    awayScore: number;
}

export interface MatchProtocolRosterPlayer {
    id: number;
    matchRosterPlayerId: number;
    teamPlayerId?: number;
    firstName: string;
    lastName: string;
    middleName?: string;
    shirtNumber?: number;
    isCaptain: boolean;
}

export interface MatchProtocolEvent {
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
    description?: string;
    isCancelled: boolean;
}

export interface MatchProtocolData {
    match: {
        id: number;
        tournamentId: number;
        round?: string;
        status: MatchStatus;
        matchDatetime?: string;
        homeTeam: MatchServiceTeam;
        awayTeam: MatchServiceTeam;
        venue?: MatchServiceVenue;
    };

    session: MatchServiceSession;

    rosters: {
        home: MatchProtocolRosterPlayer[];
        away: MatchProtocolRosterPlayer[];
    };

    events: MatchProtocolEvent[];
}

export interface StartEventRecordingDto {
    eventType: MatchEventType;
}

export interface StartEventRecordingResponse {
    session: MatchServiceSession;
    eventDraft: {
        eventType: MatchEventType;
        half: number;
        second: number;
        minute: number;
    };
}

export interface CreateMatchServiceEventDto {
    eventType: MatchEventType;
    teamId: number;
    playerId?: number;
    assistPlayerId?: number;
    secondaryPlayerId?: number;
    half?: number;
    second?: number;
    minute?: number;
    autoResume?: boolean;
    description?: string;
    clientEventId?: string;
}

export interface CreateMatchServiceEventResponse {
    event: MatchProtocolEvent;
    session: MatchServiceSession;
    duplicated: boolean;
}
