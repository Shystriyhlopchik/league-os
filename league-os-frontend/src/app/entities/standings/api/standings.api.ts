import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { StandingRow } from '../model/standings-row.model';
import { map, Observable } from 'rxjs';
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

    getLegacyPublicTournamentView(
        tournamentId: number | string,
    ): Observable<PublicTournamentView> {
        return this.getStandingsByCompetition(tournamentId).pipe(
            map((standings) => ({
                tournament: {
                    id: Number(tournamentId),
                    name: 'Турнирная таблица',
                },
                activeStageId: null,
                stages: [
                    {
                        id: null,
                        key: 'legacy',
                        name: 'Турнирная таблица',
                        type: 'round_robin' as const,
                        order: 1,
                        status: 'legacy' as const,
                        groups: [],
                        standings,
                        crossGroupRankings: [],
                        bracket: { confirmed: false, matches: [] },
                        empty: standings.length === 0,
                    },
                ],
            })),
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
