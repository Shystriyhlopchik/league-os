import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { StandingRow } from '../model/standings-row.model';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class StandingsApi {
    private readonly apiUrl = `${environment.apiUrl}/standings`;
    private readonly http = inject(HttpClient);

    getStandingsByCompetition(
        competitionId: number | string,
    ): Observable<StandingRow[]> {
        return this.http.get<StandingRow[]>(`${this.apiUrl}/${competitionId}`);
    }
}
