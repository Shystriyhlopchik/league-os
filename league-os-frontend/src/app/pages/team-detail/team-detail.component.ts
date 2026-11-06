import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
    ViewContainerRef,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { combineLatest, EMPTY, Subject } from 'rxjs';
import {
    catchError,
    distinctUntilChanged,
    finalize,
    map,
    startWith,
    switchMap,
    tap,
} from 'rxjs/operators';
import {
    ClubMatch,
    ClubPlayerStats,
    ClubStatistics,
    ClubStatisticsFilters,
    clubImage,
    playerPosition,
    TeamOverview,
    TeamPublicApi,
} from '../../entities/team/api/team-public.api';
import { PublicVideo } from '../../entities/video/video.api';
import { VideoPlayerComponent } from '../../entities/video/video-player.component';

type Tab = 'matches' | 'roster' | 'statistics' | 'media' | 'about';

@Component({
    selector: 'app-team-detail',
    imports: [DatePipe, RouterLink, DialogModule],
    templateUrl: './team-detail.component.html',
    styleUrls: ['./team-detail.component.scss', './team-detail-sections.scss'],
})
export class TeamDetailComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly api = inject(TeamPublicApi);
    private readonly destroyRef = inject(DestroyRef);
    private readonly dialog = inject(Dialog);
    private readonly viewContainerRef = inject(ViewContainerRef);
    private playerDialog?: DialogRef<unknown, VideoPlayerComponent>;
    private readonly reload = new Subject<void>();
    private readonly statsRequests = new Subject<{
        teamId: number;
        communityId: number;
        filters: ClubStatisticsFilters;
    }>();
    readonly data = signal<TeamOverview | null>(null);
    readonly loading = signal(true);
    readonly error = signal('');
    readonly tab = signal<Tab>('matches');
    readonly tabs: { id: Tab; label: string }[] = [
        { id: 'matches', label: 'Матчи' },
        { id: 'roster', label: 'Состав' },
        { id: 'statistics', label: 'Статистика' },
        { id: 'media', label: 'Медиа' },
        { id: 'about', label: 'О клубе' },
    ];
    readonly matchPeriod = signal<'upcoming' | 'past'>('upcoming');
    readonly matchTournament = signal(0);
    readonly matchLimit = signal(12);
    readonly stats = signal<ClubStatistics | null>(null);
    readonly statsLoading = signal(false);
    readonly statsError = signal('');
    readonly filters = signal<ClubStatisticsFilters>({});
    readonly image = clubImage;
    readonly position = playerPosition;
    readonly tournaments = computed(() => this.data()?.tournaments || []);
    readonly seasons = computed(() => [
        ...new Map(
            this.tournaments().map((t) => [
                t.seasonId,
                { id: t.seasonId, name: t.seasonName },
            ]),
        ).values(),
    ]);
    readonly years = computed(() =>
        [
            ...new Set(
                (this.data()?.matches || [])
                    .filter((m) => !!m.matchDatetime)
                    .map((m) => Number(m.matchDatetime!.slice(0, 4))),
            ),
        ].sort((a, b) => b - a),
    );
    readonly statsTournaments = computed(() =>
        this.tournaments().filter(
            (t) =>
                !this.filters().seasonId ||
                t.seasonId === this.filters().seasonId,
        ),
    );
    readonly matches = computed(() =>
        (this.data()?.matches || [])
            .filter(
                (m) =>
                    (!this.matchTournament() ||
                        m.tournamentId === this.matchTournament()) &&
                    (this.matchPeriod() === 'past'
                        ? m.status === 'finished' || m.status === 'cancelled'
                        : m.status === 'scheduled' || m.status === 'live'),
            )
            .sort((a, b) => {
                // Undated fixtures always go last, in either direction.
                if (!a.matchDatetime) return b.matchDatetime ? 1 : b.id - a.id;
                if (!b.matchDatetime) return -1;
                return this.matchPeriod() === 'past'
                    ? this.timestamp(b) - this.timestamp(a) || b.id - a.id
                    : this.timestamp(a) - this.timestamp(b) || a.id - b.id;
            }),
    );
    readonly visibleMatches = computed(() =>
        this.matches().slice(0, this.matchLimit()),
    );
    readonly rosterGroups = computed(() => {
        const roster = this.data()?.roster || [];
        const positions = [
            'goalkeeper',
            'defender',
            'midfielder',
            'winger',
            'forward',
            null,
        ];
        const labels: Record<string, string> = {
            goalkeeper: 'Вратари',
            defender: 'Защитники',
            midfielder: 'Полузащитники',
            winger: 'Крайние игроки',
            forward: 'Нападающие',
        };
        return positions
            .map((p) => ({
                label: p === null ? 'Другие игроки' : labels[p],
                players: roster
                    .filter((r) =>
                        p === null
                            ? !positions.slice(0, -1).includes(r.position)
                            : r.position === p,
                    )
                    .sort(
                        (a, b) =>
                            (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999) ||
                            a.name.localeCompare(b.name, 'ru'),
                    ),
            }))
            .filter((g) => g.players.length);
    });
    readonly leaders = computed(() =>
        (['goals', 'assists', 'yellowCards'] as const).map((key) => ({
            key,
            label: {
                goals: 'Голы',
                assists: 'Голевые передачи',
                yellowCards: 'Жёлтые карточки',
            }[key],
            players: [...(this.stats()?.players || [])]
                .filter((p) => p[key] > 0)
                .sort(
                    (a, b) =>
                        b[key] - a[key] ||
                        b.matches - a.matches ||
                        a.playerId - b.playerId,
                )
                .slice(0, 5),
        })),
    );
    readonly honours = computed(() =>
        this.tournaments().filter(
            (t) => t.completed && t.place && t.place <= 3,
        ),
    );

    constructor() {
        this.destroyRef.onDestroy(() => this.playerDialog?.close());
    }
    ngOnInit() {
        this.statsRequests
            .pipe(
                switchMap((request) => {
                    this.stats.set(null);
                    this.statsLoading.set(true);
                    this.statsError.set('');
                    return this.api
                        .statistics(
                            request.teamId,
                            request.communityId,
                            request.filters,
                        )
                        .pipe(
                            tap((s) => this.stats.set(s)),
                            catchError(() => {
                                this.statsError.set(
                                    'Не удалось загрузить статистику. Попробуйте ещё раз.',
                                );
                                return EMPTY;
                            }),
                            finalize(() => this.statsLoading.set(false)),
                        );
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
        combineLatest([this.route.paramMap, this.route.queryParamMap])
            .pipe(
                tap(([, query]) =>
                    this.tab.set(
                        this.tabs.find((t) => t.id === query.get('tab'))?.id ||
                            'matches',
                    ),
                ),
                map(([params, query]) => ({
                    teamId: Number(params.get('teamId')),
                    communityId: Number(query.get('communityId')) || undefined,
                })),
                distinctUntilChanged(
                    (a, b) =>
                        a.teamId === b.teamId &&
                        a.communityId === b.communityId,
                ),
                switchMap((context) =>
                    this.reload.pipe(
                        startWith(undefined),
                        switchMap(() => {
                            this.loading.set(true);
                            this.error.set('');
                            this.playerDialog?.close();
                            return this.api
                                .overview(context.teamId, context.communityId)
                                .pipe(
                                    tap((d) => this.apply(d)),
                                    catchError(() => {
                                        this.error.set(
                                            'Не удалось загрузить команду в выбранном сообществе.',
                                        );
                                        return EMPTY;
                                    }),
                                    finalize(() => this.loading.set(false)),
                                );
                        }),
                    ),
                ),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }
    private apply(data: TeamOverview) {
        this.data.set(data);
        this.error.set('');
        this.filters.set({});
        this.matchTournament.set(0);
        this.matchLimit.set(12);
        this.matchPeriod.set(
            data.matches.some(
                (m) => m.status === 'scheduled' || m.status === 'live',
            )
                ? 'upcoming'
                : 'past',
        );
        this.loadStats();
    }
    retry() {
        this.reload.next();
    }
    setTab(tab: Tab) {
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { tab },
            queryParamsHandling: 'merge',
        });
    }
    setCommunity(value: string) {
        if (Number(value) === this.data()?.communityId) return;
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { communityId: Number(value) },
            queryParamsHandling: 'merge',
        });
    }
    setPeriod(period: 'upcoming' | 'past') {
        this.matchPeriod.set(period);
        this.matchLimit.set(12);
    }
    setMatchTournament(value: string) {
        this.matchTournament.set(Number(value));
        this.matchLimit.set(12);
    }
    setFilter(key: keyof ClubStatisticsFilters, value: string) {
        const filters = { ...this.filters() };
        if (value) filters[key] = Number(value);
        else delete filters[key];
        if (key === 'seasonId') delete filters.tournamentId;
        this.filters.set(filters);
        this.loadStats();
    }
    resetFilters() {
        this.filters.set({});
        this.loadStats();
    }
    loadStats() {
        const d = this.data();
        if (d)
            this.statsRequests.next({
                teamId: d.team.id,
                communityId: d.communityId,
                filters: this.filters(),
            });
    }
    playerLink(player: Pick<ClubPlayerStats, 'playerId'>) {
        return ['/team', this.data()!.team.id, 'players', player.playerId];
    }
    result(match: ClubMatch) {
        const id = this.data()?.team.id;
        if (match.winnerTeamId) return match.winnerTeamId === id ? 'В' : 'П';
        if (match.homeScore === match.awayScore) return 'Н';
        return (match.homeTeam?.id === id) ===
            (match.homeScore || 0) > (match.awayScore || 0)
            ? 'В'
            : 'П';
    }
    private timestamp(m: ClubMatch) {
        return m.matchDatetime ? new Date(m.matchDatetime).getTime() : 0;
    }
    photoFailed(event: Event) {
        const img = event.target as HTMLImageElement;
        img.onerror = null;
        img.src = clubImage(null, true);
    }
    logoFailed(event: Event) {
        const img = event.target as HTMLImageElement;
        img.onerror = null;
        img.src = clubImage(null);
    }
    play(video: PublicVideo) {
        this.playerDialog?.close();
        this.playerDialog = this.dialog.open(VideoPlayerComponent, {
            data: video,
            viewContainerRef: this.viewContainerRef,
            width: '1000px',
            maxWidth: 'calc(100vw - 24px)',
            ariaLabelledBy: 'video-player-title',
            restoreFocus: true,
            autoFocus: 'first-tabbable',
        });
    }
}
