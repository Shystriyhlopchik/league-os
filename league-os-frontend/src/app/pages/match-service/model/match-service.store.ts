import { EMPTY, finalize, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { computed, inject, Injectable, signal } from '@angular/core';
import { MatchServiceApi } from '../../../entities/match-service/api/match-service.api';
import { MatchServiceMatch } from '../../../entities/match-service/model/match-service.types';

@Injectable()
export class MatchServiceStore {
    private readonly matchServiceApi = inject(MatchServiceApi);

    readonly matches = signal<MatchServiceMatch[]>([]);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly isEmpty = computed(() => {
        return !this.isLoading() && this.matches().length === 0;
    });

    loadMatches(): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.matchServiceApi
            .getAvailableMatches()
            .pipe(
                tap((matches) => {
                    this.matches.set(matches);
                }),
                catchError(() => {
                    this.error.set('Не удалось загрузить список матчей');
                    this.matches.set([]);

                    return EMPTY;
                }),
                finalize(() => {
                    this.isLoading.set(false);
                }),
            )
            .subscribe();
    }
}
