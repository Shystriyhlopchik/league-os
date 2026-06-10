import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { MatchRosterCheck } from '../model/match-roster.types';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';

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
}
