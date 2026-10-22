import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TournamentPlayerLeadersResponse } from '../model/player-leader.types';

@Injectable({ providedIn: 'root' })
export class PlayerLeadersApi {
    private readonly http = inject(HttpClient);

    getLeaderboards(
        tournamentId: number,
        groupId?: number,
    ): Observable<TournamentPlayerLeadersResponse> {
        return this.http.get<TournamentPlayerLeadersResponse>(
            `${environment.apiUrl}/tournaments/${tournamentId}/player-leaders`,
            {
                params:
                    groupId === undefined ? {} : { groupId: String(groupId) },
            },
        );
    }
}
