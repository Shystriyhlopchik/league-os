import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
    CreateMatchServiceEventDto, CreateMatchServiceEventResponse,
    MatchProtocolData, MatchProtocolEvent,
    MatchServiceMatch,
    MatchServiceSession,
    StartEventRecordingDto, StartEventRecordingResponse
} from '../model/match-service.types';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class MatchServiceApi {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = environment.apiUrl;

    getAvailableMatches(): Observable<MatchServiceMatch[]> {
        return this.http.get<MatchServiceMatch[]>(
            `${this.apiUrl}/match-service/matches`,
        );
    }

    getSession(matchId: number): Observable<MatchProtocolData> {
        return this.http.get<MatchProtocolData>(
            `${this.apiUrl}/match-service/matches/${matchId}/session`,
        );
    }

    startMatch(matchId: number): Observable<MatchServiceSession> {
        return this.http.post<MatchServiceSession>(
            `${this.apiUrl}/match-service/matches/${matchId}/start`,
            {},
        );
    }

    pauseMatch(matchId: number): Observable<MatchServiceSession> {
        return this.http.post<MatchServiceSession>(
            `${this.apiUrl}/match-service/matches/${matchId}/pause`,
            {},
        );
    }

    resumeMatch(matchId: number): Observable<MatchServiceSession> {
        return this.http.post<MatchServiceSession>(
            `${this.apiUrl}/match-service/matches/${matchId}/resume`,
            {},
        );
    }

    finishHalf(matchId: number): Observable<MatchServiceSession> {
        return this.http.post<MatchServiceSession>(
            `${this.apiUrl}/match-service/matches/${matchId}/finish-half`,
            {},
        );
    }

    startSecondHalf(matchId: number): Observable<MatchServiceSession> {
        return this.http.post<MatchServiceSession>(
            `${this.apiUrl}/match-service/matches/${matchId}/start-second-half`,
            {},
        );
    }

    finishMatch(matchId: number): Observable<MatchServiceSession> {
        return this.http.post<MatchServiceSession>(
            `${this.apiUrl}/match-service/matches/${matchId}/finish`,
            {},
        );
    }

    startEventRecording(
        matchId: number,
        dto: StartEventRecordingDto,
    ): Observable<StartEventRecordingResponse> {
        return this.http.post<StartEventRecordingResponse>(
            `${this.apiUrl}/match-service/matches/${matchId}/events/start-recording`,
            dto,
        );
    }

    createEvent(
        matchId: number,
        dto: CreateMatchServiceEventDto,
    ): Observable<CreateMatchServiceEventResponse> {
        return this.http.post<CreateMatchServiceEventResponse>(
            `${this.apiUrl}/match-service/matches/${matchId}/events`,
            dto,
        );
    }

    cancelEvent(matchId: number, eventId: number): Observable<{
        cancelledEvent: MatchProtocolEvent;
        session: MatchServiceSession;
        events: MatchProtocolEvent[];
    }> {
        return this.http.post<{
            cancelledEvent: MatchProtocolEvent;
            session: MatchServiceSession;
            events: MatchProtocolEvent[];
        }>(
            `${this.apiUrl}/match-service/matches/${matchId}/events/${eventId}/cancel`,
            {},
        );
    }

    cancelEventRecording(matchId: number): Observable<MatchServiceSession> {
        return this.http.post<MatchServiceSession>(
            `${this.apiUrl}/match-service/matches/${matchId}/events/cancel-recording`,
            {},
        );
    }
}
