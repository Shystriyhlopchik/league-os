import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { TeamRankingResponse } from '../model/team-ranking.model';

@Injectable({ providedIn: 'root' })
export class TeamRankingApi {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = `${environment.apiUrl}/team-rankings/competitions`;

    getCurrent(competitionId: number): Observable<TeamRankingResponse> {
        return this.http.get<TeamRankingResponse>(
            `${this.apiUrl}/${competitionId}/current`,
        );
    }

    getHistorical(competitionId: number): Observable<TeamRankingResponse> {
        return this.http.get<TeamRankingResponse>(
            `${this.apiUrl}/${competitionId}/historical`,
        );
    }
}
