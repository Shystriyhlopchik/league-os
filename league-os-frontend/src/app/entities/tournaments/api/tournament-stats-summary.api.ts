import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { StatsSummaryData } from '../model/tournament-stats-summary.types';
import { environment } from '../../../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class TournamentStatsSummaryApi {
    private readonly http = inject(HttpClient);

    getStatsSummary(tournamentId: number): Observable<StatsSummaryData> {
        return this.http.get<StatsSummaryData>(
            `${environment.apiUrl}/tournaments/${tournamentId}/stats-summary`,
        );
    }
}
