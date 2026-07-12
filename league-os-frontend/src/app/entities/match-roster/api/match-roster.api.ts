import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { MatchRosterCheck } from '../model/match-roster.types';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';

export type ManualMatchEventType =
    | 'goal'
    | 'yellow_card'
    | 'red_card'
    | 'red_ball';

export interface ManualMatchEvent {
    id: number;
    matchId: number;
    teamId: number;
    eventType: ManualMatchEventType;
    minute: number;
    half: 1 | 2;
    playerId?: number;
    assistPlayerId?: number;
}

export interface CreateManualMatchEvent {
    teamId: number;
    eventType: ManualMatchEventType;
    minute: number;
    half: 1 | 2;
    playerId?: number;
    assistPlayerId?: number;
}

export interface SignedManualProtocol {
    matchId: number;
    status: 'finished';
    homeScore: number;
    awayScore: number;
}

@Injectable({
    providedIn: 'root',
})
export class MatchRosterApi {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = environment.apiUrl;

    getRosterCheck(matchId: number): Observable<MatchRosterCheck> {
        return this.http.get<MatchRosterCheck>(
            `${this.apiUrl}/match-service/matches/${matchId}/rosters`,
        );
    }

    approveRoster(matchId: number, teamId: number): Observable<MatchRosterCheck> {
        return this.http.post<MatchRosterCheck>(
            `${this.apiUrl}/match-service/matches/${matchId}/rosters/${teamId}/approve`,
            {},
        );
    }

    getManualEvents(matchId: number): Observable<ManualMatchEvent[]> {
        return this.http.get<ManualMatchEvent[]>(
            `${this.apiUrl}/match-service/matches/${matchId}/manual-events`,
        );
    }

    createManualEvent(
        matchId: number,
        dto: CreateManualMatchEvent,
    ): Observable<ManualMatchEvent> {
        return this.http.post<ManualMatchEvent>(
            `${this.apiUrl}/match-service/matches/${matchId}/manual-events`,
            dto,
        );
    }

    signManualProtocol(matchId: number): Observable<SignedManualProtocol> {
        return this.http.post<SignedManualProtocol>(
            `${this.apiUrl}/match-service/matches/${matchId}/manual-protocol/sign`,
            {},
        );
    }
}
