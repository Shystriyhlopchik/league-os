import { DOCUMENT } from '@angular/common';
import {
    Component,
    computed,
    DestroyRef,
    effect,
    HostListener,
    inject,
    signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
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
import { VideosComponent } from '../../widgets/videos/videos.component';

@Component({
    selector: 'app-home',
    imports: [
        RouterLink,
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
        VideosComponent,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {
    readonly isYardLinePaused = signal(false);
    readonly introSlides = [
        {
            src: 'brand/photos/match-action.jpg',
            alt: 'Борьба за мяч в вечернем матче Дворовой лиги',
            position: '60% 48%',
            mobilePosition: '61% 50%',
        },
        {
            src: 'brand/photos/match-duel.jpg',
            alt: 'Игроки борются за мяч у ворот',
            position: '60% 50%',
            mobilePosition: '53% 50%',
        },
        {
            src: 'brand/photos/match-strike.jpg',
            alt: 'Футболист наносит удар по мячу',
            position: '58% 50%',
            mobilePosition: '53% 50%',
        },
    ] as const;
    readonly activeIntroSlide = signal(0);
    readonly introPaused = signal(false);
    readonly introControlsHovered = signal(false);
    readonly introFocused = signal(false);
    readonly introReducedMotion = signal(false);
    readonly loadedIntroSlides = signal<ReadonlySet<number>>(new Set());
    private readonly document = inject(DOCUMENT);
    private readonly introPageHidden = signal(this.document.hidden);
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
        const view = this.document.defaultView;
        const motion = view?.matchMedia('(prefers-reduced-motion: reduce)');
        if (motion) {
            this.introReducedMotion.set(motion.matches);
            const updateMotion = (event: MediaQueryListEvent) =>
                this.introReducedMotion.set(event.matches);
            motion.addEventListener('change', updateMotion);
            inject(DestroyRef).onDestroy(() =>
                motion.removeEventListener('change', updateMotion),
            );
        }
        effect((onCleanup) => {
            // A new active frame restarts the full interval after a manual selection.
            this.activeIntroSlide();
            if (
                !view ||
                this.introPaused() ||
                this.introReducedMotion() ||
                this.introControlsHovered() ||
                this.introFocused() ||
                this.introPageHidden() ||
                this.loadedIntroSlides().size < 2
            )
                return;
            const timer = view.setTimeout(() => this.stepIntro(1, false), 6500);
            onCleanup(() => view.clearTimeout(timer));
        });
        effect(() => {
            const groups = this.groups();
            const selectedGroupId = this.selectedGroupId();
            if (!groups.some((group) => group.value === selectedGroupId)) {
                this.selectedGroupId.set(groups[0]?.value ?? null);
            }
        });
    }

    markIntroLoaded(index: number): void {
        this.loadedIntroSlides.update((loaded) => new Set([...loaded, index]));
        if (!this.loadedIntroSlides().has(this.activeIntroSlide())) {
            this.activeIntroSlide.set(index);
        }
    }

    markIntroFailed(index: number): void {
        const loaded = new Set(this.loadedIntroSlides());
        loaded.delete(index);
        this.loadedIntroSlides.set(loaded);
        if (index === this.activeIntroSlide() && loaded.size)
            this.activeIntroSlide.set([...loaded][0]);
    }

    stepIntro(direction: number, manual = true): void {
        const available = [...this.loadedIntroSlides()].sort((a, b) => a - b);
        if (available.length < 2) return;
        if (manual) this.introPaused.set(true);
        const position = available.indexOf(this.activeIntroSlide());
        this.activeIntroSlide.set(
            available[
                (position + direction + available.length) % available.length
            ],
        );
    }

    @HostListener('document:visibilitychange')
    onIntroVisibilityChange(): void {
        this.introPageHidden.set(this.document.hidden);
    }
}
