import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Competition } from '../model/competition.model';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class CompetitionApi {
    private readonly apiUrl = `${environment.apiUrl}/competitions`;
    private readonly http = inject(HttpClient);

    getCompetitions(): Observable<Competition[]> {
        return this.http.get<Competition[]>(this.apiUrl);
    }
}
