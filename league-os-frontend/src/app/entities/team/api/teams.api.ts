import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Team } from '../model/team.types';

@Injectable({
    providedIn: 'root',
})
export class TeamsApi {
    private readonly http = inject(HttpClient);

    getTeams(): Observable<Team[]> {
        return this.http.get<Team[]>(`${environment.apiUrl}/teams`);
    }

    getTeam(teamId: number): Observable<Team> {
        return this.http.get<Team>(`${environment.apiUrl}/teams/${teamId}`);
    }

    getTournamentTeams(tournamentId: number): Observable<Team[]> {
        return this.http.get<Team[]>(
            `${environment.apiUrl}/tournaments/${tournamentId}/teams`,
        );
    }
}
