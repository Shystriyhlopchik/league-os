import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, EMPTY, Subject } from 'rxjs';
import { catchError, finalize, startWith, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    ClubPlayerProfile,
    clubImage,
    playerPosition,
    TeamPublicApi,
} from '../../entities/team/api/team-public.api';

@Component({
    selector: 'app-club-player',
    imports: [RouterLink],
    styleUrl: './team-detail.component.scss',
    template: `<section class="club-page" aria-label="Карточка игрока">
        <a
            class="back-link"
            [routerLink]="['/team', teamId]"
            [queryParams]="{
                communityId: profile()?.communityId || communityId,
                tab: 'roster',
            }"
            >← К команде {{ profile()?.team?.name }}</a
        >
        @if (loading()) {
            <p class="empty" role="status">Загружаем карточку игрока…</p>
        } @else if (error()) {
            <div class="empty" role="alert">
                <p>{{ error() }}</p>
                <button (click)="reload.next()">Повторить</button>
            </div>
        } @else {
            @if (profile(); as p) {
                <header class="club-hero">
                    <img
                        class="club-logo"
                        [src]="image(p.player.photoUrl, true)"
                        [alt]="p.player.name"
                        (error)="photoFailed($event)"
                    />
                    <div class="club-identity">
                        <p class="eyebrow">
                            Карточка игрока / {{ p.team.name }}
                        </p>
                        <h1>{{ p.player.name }}<span>.</span></h1>
                        <p class="club-location">
                            {{ position(p.player.position) }}
                            @if (p.player.shirtNumber != null) {
                                · № {{ p.player.shirtNumber }}
                            }
                        </p>
                        <p class="hint">
                            {{
                                p.player.isCurrent
                                    ? 'В действующем составе команды'
                                    : 'Историческая статистика выступлений за команду'
                            }}
                        </p>
                    </div>
                </header>
                <section aria-labelledby="player-stats-title">
                    <div class="section-heading">
                        <h2 id="player-stats-title">
                            В игре за {{ p.team.name }}<span>.</span>
                        </h2>
                    </div>
                    <p class="hint">
                        Завершённые матчи этой команды в выбранном сообществе.
                        Выступления за другие клубы сюда не включены.
                    </p>
                    <div class="stat-strip">
                        <div>
                            <strong>{{ p.totals.matches }}</strong
                            ><span>Матчи</span>
                        </div>
                        <div>
                            <strong>{{ p.totals.goals }}</strong
                            ><span>Голы</span>
                        </div>
                        <div>
                            <strong>{{ p.totals.assists }}</strong
                            ><span>Передачи</span>
                        </div>
                        <div>
                            <strong>{{ p.totals.yellowCards }}</strong
                            ><span>Жёлтые карточки</span>
                        </div>
                        <div>
                            <strong>{{ p.totals.secondYellowCards }}</strong
                            ><span>Из них вторые ЖК</span>
                        </div>
                        <div>
                            <strong>{{ p.totals.redCards }}</strong
                            ><span>Красные карточки</span>
                        </div>
                    </div>
                    <h3 class="position-heading">По сезонам и турнирам</h3>
                    <div
                        class="table-scroll"
                        tabindex="0"
                        role="region"
                        aria-label="Статистика игрока по турнирам"
                    >
                        <table>
                            <thead>
                                <tr>
                                    <th>Турнир / сезон</th>
                                    <th>Матчи</th>
                                    <th>Голы</th>
                                    <th>Передачи</th>
                                    <th>ЖК</th>
                                    <th>КК</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (s of p.seasons; track s.tournamentId) {
                                    <tr>
                                        <td>
                                            <a
                                                [routerLink]="[
                                                    '/tournaments',
                                                    s.tournamentId,
                                                ]"
                                                >{{ s.tournamentName }} ·
                                                {{ s.seasonName }}</a
                                            >
                                        </td>
                                        <td>{{ s.matches }}</td>
                                        <td>{{ s.goals }}</td>
                                        <td>{{ s.assists }}</td>
                                        <td>{{ s.yellowCards }}</td>
                                        <td>{{ s.redCards }}</td>
                                    </tr>
                                } @empty {
                                    <tr>
                                        <td colspan="6">
                                            Статистика появится после первых
                                            завершённых матчей.
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                </section>
            }
        }
    </section>`,
})
export class ClubPlayerComponent {
    private readonly api = inject(TeamPublicApi);
    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);
    readonly profile = signal<ClubPlayerProfile | null>(null);
    readonly loading = signal(true);
    readonly error = signal('');
    readonly reload = new Subject<void>();
    readonly image = clubImage;
    readonly position = playerPosition;
    teamId = 0;
    communityId?: number;
    constructor() {
        combineLatest([this.route.paramMap, this.route.queryParamMap])
            .pipe(
                switchMap(([params, query]) => {
                    this.teamId = Number(params.get('teamId'));
                    this.communityId =
                        Number(query.get('communityId')) || undefined;
                    return this.reload.pipe(
                        startWith(undefined),
                        switchMap(() => {
                            this.loading.set(true);
                            this.error.set('');
                            this.profile.set(null);
                            return this.api
                                .player(
                                    this.teamId,
                                    Number(params.get('playerId')),
                                    this.communityId,
                                )
                                .pipe(
                                    finalize(() => this.loading.set(false)),
                                    catchError(() => {
                                        this.error.set(
                                            'Не удалось загрузить игрока. Проверьте команду и сообщество.',
                                        );
                                        return EMPTY;
                                    }),
                                );
                        }),
                    );
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((p) => this.profile.set(p));
    }
    photoFailed(event: Event) {
        const img = event.target as HTMLImageElement;
        img.onerror = null;
        img.src = clubImage(null, true);
    }
}
