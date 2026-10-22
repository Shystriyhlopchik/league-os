import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { TournamentPlayerCards } from '../model/player-card.types';

@Injectable({ providedIn: 'root' })
export class PlayerCardsApi {
    private readonly http = inject(HttpClient);

    getTournamentCards(
        tournamentId: number,
    ): Observable<TournamentPlayerCards> {
        return this.http.get<TournamentPlayerCards>(
            `${environment.apiUrl}/players/cards/tournament/${tournamentId}`,
        );
    }
}
