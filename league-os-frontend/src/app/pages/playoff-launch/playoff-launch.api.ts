import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
    PlayoffLaunchPayload,
    PlayoffLaunchState,
} from './playoff-launch.types';

@Injectable({ providedIn: 'root' })
export class PlayoffLaunchApi {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = `${environment.apiUrl}/tournaments`;

    getState(tournamentId: number): Observable<PlayoffLaunchState> {
        return this.http.get<PlayoffLaunchState>(
            `${this.apiUrl}/${tournamentId}/playoff-launch`,
        );
    }

    prepare(tournamentId: number): Observable<PlayoffLaunchState> {
        return this.http.post<PlayoffLaunchState>(
            `${this.apiUrl}/${tournamentId}/playoff-launch/prepare`,
            {},
        );
    }

    launch(
        tournamentId: number,
        payload: PlayoffLaunchPayload,
    ): Observable<PlayoffLaunchState> {
        return this.http.post<PlayoffLaunchState>(
            `${this.apiUrl}/${tournamentId}/playoff-launch`,
            payload,
        );
    }
}
