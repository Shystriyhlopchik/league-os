import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { MatchApi } from '../../../entities/match/api/match.api';
import {
    MatchProtocol,
    MatchProtocolRosters,
} from '../../../entities/match/model/match-protocol.types';

@Injectable({
    providedIn: 'root'
})
export class MatchViewProtocolStore {
    private readonly matchApi = inject(MatchApi);

    readonly protocol = signal<MatchProtocol | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly match = computed(() => this.protocol()?.match ?? null);
    readonly events = computed(() => this.protocol()?.events ?? []);
    readonly officials = computed(() => this.protocol()?.officials ?? []);

    readonly rosters = computed<MatchProtocolRosters>(() => {
        return (
            this.protocol()?.rosters ?? {
                home: [],
                away: [],
            }
        );
    });

    readonly hasEvents = computed(() => this.events().length > 0);

    readonly hasHomeRoster = computed(() => {
        return this.rosters().home.length > 0;
    });

    readonly hasAwayRoster = computed(() => {
        return this.rosters().away.length > 0;
    });

    readonly hasRosters = computed(() => {
        return this.hasHomeRoster() || this.hasAwayRoster();
    });

    load(matchId: number | string): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.matchApi
            .getProtocol(matchId)
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (protocol) => {
                    this.protocol.set(protocol);
                },
                error: () => {
                    this.protocol.set(null);
                    this.error.set('Не удалось загрузить протокол матча');
                },
            });
    }
}
