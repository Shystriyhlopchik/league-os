import { DestroyRef, inject, Injectable, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import {TournamentStatsSummaryApi} from '../../../entities/tournaments/api/tournament-stats-summary.api';
import {StatsSummaryData} from '../stats-summary.component';


@Injectable()
export class StatsSummaryStore {
    private readonly api = inject(TournamentStatsSummaryApi);
    private readonly destroyRef = inject(DestroyRef);

    readonly stats = signal<StatsSummaryData | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly hasStats = computed(() => {
        return this.stats() !== null;
    });

    loadStats(tournamentId: number): void {
        if (!tournamentId) {
            this.stats.set(null);
            return;
        }

        this.isLoading.set(true);
        this.error.set(null);

        this.api
            .getStatsSummary(tournamentId)
            .pipe(
                tap((stats) => {
                    this.stats.set(stats);
                }),
                catchError(() => {
                    this.stats.set(null);
                    this.error.set('Не удалось загрузить статистику сезона');
                    return EMPTY;
                }),
                finalize(() => {
                    this.isLoading.set(false);
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }
}
