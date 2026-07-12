import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
    ActivateRedBallDto,
    ActivateRedBallResponse,
    CreateMatchServiceEventDto, CreateMatchServiceEventResponse,
    MatchProtocolData, MatchProtocolEvent,
    MatchServiceMatch, MatchRegistration,
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

    getOverdueMatches(): Observable<MatchServiceMatch[]> {
        return this.http.get<MatchServiceMatch[]>(
            `${this.apiUrl}/match-service/overdue-matches`,
        );
    }

    getRegistrationMatches(): Observable<MatchServiceMatch[]> {
        return this.http.get<MatchServiceMatch[]>(
            `${this.apiUrl}/match-service/registration-matches`,
        );
    }

    getMatchRegistration(matchId: number, teamId: number): Observable<MatchRegistration> {
        return this.http.get<MatchRegistration>(
            `${this.apiUrl}/match-service/registration-matches/${matchId}/teams/${teamId}/roster`,
        );
    }

    saveMatchRegistration(
        matchId: number,
        teamId: number,
        teamPlayerIds: number[],
    ): Observable<MatchRegistration> {
        return this.http.put<MatchRegistration>(
            `${this.apiUrl}/match-service/registration-matches/${matchId}/teams/${teamId}/roster`,
            { teamPlayerIds },
        );
    }

    approveMatchRegistration(
        matchId: number,
        teamId: number,
    ): Observable<MatchRegistration> {
        return this.http.post<MatchRegistration>(
            `${this.apiUrl}/match-service/registration-matches/${matchId}/teams/${teamId}/roster/approve`,
            {},
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

    activateRedBall(
        matchId: number,
        dto: ActivateRedBallDto,
    ): Observable<ActivateRedBallResponse> {
        return this.http.post<ActivateRedBallResponse>(
            `${this.apiUrl}/match-service/matches/${matchId}/red-ball/activate`,
            {
                teamId: Number(dto.teamId),
            },
        );
    }

    signProtocol(matchId: number): Observable<MatchServiceSession> {
        return this.http.post<MatchServiceSession>(
            `${this.apiUrl}/match-service/matches/${matchId}/sign-protocol`,
            {},
        );
    }
}
