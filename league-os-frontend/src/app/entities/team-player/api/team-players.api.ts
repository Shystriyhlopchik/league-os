import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {CreateTeamPlayerDto, TeamPlayer} from '../model/team-player.types';

@Injectable({
    providedIn: 'root',
})
export class TeamPlayersApi {
    private readonly http = inject(HttpClient);

    getByTeam(teamId: number): Observable<TeamPlayer[]> {
        return this.http.get<TeamPlayer[]>(
            `${environment.apiUrl}/teams/${teamId}/players`,
        );
    }
    create(teamId: number, dto: CreateTeamPlayerDto): Observable<TeamPlayer> {
        return this.http.post<TeamPlayer>(
            `${environment.apiUrl}/teams/${teamId}/players`,
            dto,
        );
    }
}
