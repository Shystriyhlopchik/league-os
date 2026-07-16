import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { StandingRow } from '../model/standings-row.model';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
    PublicSuspension,
    PublicTournamentView,
} from '../model/public-tournament-view.model';

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

    getPublicTournamentView(
        tournamentId: number | string,
    ): Observable<PublicTournamentView> {
        return this.http.get<PublicTournamentView>(
            `${this.apiUrl}/tournaments/${tournamentId}/public-view`,
        );
    }

    getActiveSuspensions(
        tournamentId: number | string,
    ): Observable<PublicSuspension[]> {
        return this.http.get<PublicSuspension[]>(
            `${environment.apiUrl}/tournaments/${tournamentId}/discipline/suspensions/active`,
        );
    }
}
