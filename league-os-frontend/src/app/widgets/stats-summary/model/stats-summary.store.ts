import {
    DestroyRef,
    inject,
    Injectable,
    signal,
    computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subscription } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import { TournamentStatsSummaryApi } from '../../../entities/tournaments/api/tournament-stats-summary.api';
import { StatsSummaryData } from '../stats-summary.component';

@Injectable()
export class StatsSummaryStore {
    private readonly api = inject(TournamentStatsSummaryApi);
    private readonly destroyRef = inject(DestroyRef);
    private loadSubscription?: Subscription;

    readonly stats = signal<StatsSummaryData | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly hasStats = computed(() => {
        return this.stats() !== null;
    });

    loadStats(tournamentId: number, groupId?: number | null): void {
        this.loadSubscription?.unsubscribe();
        if (!tournamentId || groupId === null) {
            this.stats.set(null);
            this.isLoading.set(false);
            return;
        }

        this.isLoading.set(true);
        this.error.set(null);

        this.loadSubscription = this.api
            .getStatsSummary(tournamentId, groupId ?? undefined)
            .pipe(
                tap((stats) => {
                    this.stats.set(stats);
                }),
                catchError(() => {
                    this.stats.set(null);
                    this.error.set('Не удалось загрузить статистику группы');
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
