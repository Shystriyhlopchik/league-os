import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, shareReplay, switchMap } from 'rxjs';
import { MatchesSliderComponent } from '../../widgets/matches-slide/matches-slider/matches-slider.component';
import { StatisticsPreviewComponent } from '../../widgets/statistics-preview/statistics-preview.component';
import { NewsPreviewComponent } from '../../widgets/news-preview/ui/news-preview/news-preview.component';
import { AdvertisingBannerComponent } from '../../widgets/advertising-banner/advertising-banner.component';
import { StatsSummaryComponent } from '../../widgets/stats-summary/stats-summary.component';
import { TeamsMapComponent } from '../../widgets/teams-map/teams-map.component';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { SelectOption } from '../../shared/ui/select/select-option.model';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { SponsorsComponent } from '../../widgets/sponsors/sponsors.component';
import { PlayerLeadersListComponent } from '../../widgets/player-leaders-list/player-leaders-list.component';
import {
    PLAYER_LEADERBOARD_METRICS,
    PlayerLeaderboardMetric,
} from '../../entities/tournaments/model/player-leader.types';
import { TopPlayersOvrComponent } from '../../widgets/top-players-ovr/top-players-ovr.component';

@Component({
    selector: 'app-home',
    imports: [
        MatchesSliderComponent,
        StatisticsPreviewComponent,
        NewsPreviewComponent,
        AdvertisingBannerComponent,
        StatsSummaryComponent,
        TeamsMapComponent,
        SelectComponent,
        SponsorsComponent,
        PlayerLeadersListComponent,
        TopPlayersOvrComponent,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly standingsApi = inject(StandingsApi);
    private readonly activeTournament$ = this.tournamentsApi
        .getActiveTournament()
        .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    readonly activeTournament = toSignal(this.activeTournament$, {
        initialValue: null,
    });

    readonly tournamentView = toSignal(
        this.activeTournament$.pipe(
            switchMap((tournament) =>
                tournament
                    ? this.standingsApi.getPublicTournamentView(tournament.id)
                    : of(null),
            ),
            catchError(() => of(null)),
        ),
        { initialValue: null },
    );

    readonly groups = computed<SelectOption<number>[]>(() => {
        const stage = this.tournamentView()?.stages.find(
            (candidate) => candidate.groups.length > 0,
        );

        return (
            stage?.groups.map((group) => ({
                value: group.id,
                label: group.name,
            })) ?? []
        );
    });

    readonly selectedGroupId = signal<number | null>(null);
    readonly playerLeaderMetrics: readonly PlayerLeaderboardMetric[] =
        PLAYER_LEADERBOARD_METRICS;
    readonly statsTitle = computed(() => {
        const group = this.groups().find(
            (option) => option.value === this.selectedGroupId(),
        );
        return group ? `Статистика: ${group.label}` : 'Статистика сезона';
    });

    constructor() {
        effect(() => {
            const groups = this.groups();
            const selectedGroupId = this.selectedGroupId();
            if (!groups.some((group) => group.value === selectedGroupId)) {
                this.selectedGroupId.set(groups[0]?.value ?? null);
            }
        });
    }
}
