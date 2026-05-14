import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Tournament } from '../model/tournaments.model';

@Injectable({
    providedIn: 'root',
})
export class TournamentsApi {
    private readonly apiUrl = `${environment.apiUrl}/tournaments/season/`;
    private readonly http = inject(HttpClient);

    getTournamentsSeason(seasonId: number): Observable<Tournament[]> {
        return this.http.get<Tournament[]>(this.apiUrl + seasonId);
    }
}
