import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { MatchApi } from '../../../entities/match/api/match.api';
import { MatchCardVm } from '../../../entities/match/model/match-card.vm';
import { mapMatchToCardVm } from '../../../entities/match/model/match.mapper';

@Injectable()
export class MatchesSliderStore {
    private readonly matchApi = inject(MatchApi);

    readonly matches = signal<MatchCardVm[]>([]);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly isEmpty = computed(() => {
        return !this.isLoading() && this.matches().length === 0;
    });

    loadByTournament(tournamentId: number | string): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.matchApi
            .getByTournament(tournamentId)
            .pipe(
                finalize(() => {
                    this.isLoading.set(false);
                }),
            )
            .subscribe({
                next: (matches) => {
                    this.matches.set(matches.map(mapMatchToCardVm));
                },

                error: () => {
                    this.matches.set([]);
                    this.error.set('Не удалось загрузить матчи');
                },
            });
    }

    loadBySeason(seasonId: number | string): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.matchApi
            .getBySeason(seasonId)
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (matches) => {
                    this.matches.set(matches.map(mapMatchToCardVm));
                },
                error: () => {
                    this.matches.set([]);
                    this.error.set('Не удалось загрузить матчи сезона');
                },
            });
    }
}
