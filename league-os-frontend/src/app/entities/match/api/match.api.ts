import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Match } from '../model/match.types';

@Injectable({
    providedIn: 'root',
})
export class MatchApi {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = environment.apiUrl;

    getByTournament(tournamentId: number | string): Observable<Match[]> {
        return this.http.get<Match[]>(
            `${this.apiUrl}/matches/tournament/${tournamentId}`,
        );
    }
}
