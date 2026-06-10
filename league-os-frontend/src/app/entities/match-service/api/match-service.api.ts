import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { MatchServiceMatch } from '../model/match-service.types';
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
}
