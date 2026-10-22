import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, forkJoin } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';

import { TeamRankingApi } from '../../entities/team-ranking/api/team-ranking.api';
import {
    TeamRankingMode,
    TeamRankingResponse,
    TeamRankingRow,
    TeamSeasonRatingBreakdown,
} from '../../entities/team-ranking/model/team-ranking.model';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';

@Component({
    selector: 'app-team-ranking-page',
    imports: [RouterLink],
    templateUrl: './team-ranking-page.component.html',
    styleUrl: './team-ranking-page.component.scss',
})
export class TeamRankingPageComponent implements OnInit {
    readonly defaultTeamLogo = '/images/teams/default-team-logo.png';

    private readonly rankingsApi = inject(TeamRankingApi);
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly destroyRef = inject(DestroyRef);

    readonly current = signal<TeamRankingResponse | null>(null);
    readonly historical = signal<TeamRankingResponse | null>(null);
    readonly mode = signal<TeamRankingMode>('current');
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly ranking = computed(() =>
        this.mode() === 'current' ? this.current() : this.historical(),
    );

    ngOnInit(): void {
        this.loadRankings();
    }

    loadRankings(): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.tournamentsApi
            .getActiveTournament()
            .pipe(
                switchMap((tournament) => {
                    if (!tournament) {
                        this.error.set('Активный турнир не найден.');
                        return EMPTY;
                    }
                    return forkJoin({
                        current: this.rankingsApi.getCurrent(
                            tournament.competition.id,
                        ),
                        historical: this.rankingsApi.getHistorical(
                            tournament.competition.id,
                        ),
                    });
                }),
                tap(({ current, historical }) => {
                    this.current.set(current);
                    this.historical.set(historical);
                }),
                catchError(() => {
                    this.error.set(
                        'Не удалось загрузить рейтинг. Попробуйте ещё раз.',
                    );
                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    selectMode(mode: TeamRankingMode): void {
        this.mode.set(mode);
    }

    latestSeason(row: TeamRankingRow): TeamSeasonRatingBreakdown | undefined {
        return row.seasonBreakdown[0];
    }

    seasonLabel(season: TeamSeasonRatingBreakdown): string {
        return season.season.year
            ? `${season.season.name} · ${season.season.year}`
            : season.season.name;
    }

    signed(value: number): string {
        return value > 0 ? `+${value}` : String(value);
    }

    useFallbackLogo(event: Event): void {
        const image = event.target as HTMLImageElement;
        image.onerror = null;
        image.src = this.defaultTeamLogo;
    }
}
