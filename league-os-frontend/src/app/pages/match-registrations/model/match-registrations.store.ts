import { computed, inject, Injectable, signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { MatchServiceApi } from '../../../entities/match-service/api/match-service.api';
import { MatchServiceMatch } from '../../../entities/match-service/model/match-service.types';

@Injectable()
export class MatchRegistrationsStore {
    private readonly matchServiceApi = inject(MatchServiceApi);

    readonly matches = signal<MatchServiceMatch[]>([]);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);
    readonly isEmpty = computed(
        () => !this.isLoading() && this.matches().length === 0,
    );

    loadMatches(): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.matchServiceApi
            .getRegistrationMatches()
            .pipe(
                tap((matches) => this.matches.set(matches)),
                catchError(() => {
                    this.error.set('Не удалось загрузить ближайшие игры');
                    this.matches.set([]);

                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
            )
            .subscribe();
    }
}
