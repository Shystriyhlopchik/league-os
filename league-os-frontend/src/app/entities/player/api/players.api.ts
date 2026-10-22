import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PlayerTicker } from '../model/player-ticker.types';

@Injectable({ providedIn: 'root' })
export class PlayersApi {
    private readonly http = inject(HttpClient);

    getTicker(): Observable<PlayerTicker> {
        return this.http.get<PlayerTicker>(
            `${environment.apiUrl}/players/ticker`,
        );
    }
}
