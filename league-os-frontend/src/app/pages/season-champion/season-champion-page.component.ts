import { ArrowUpRightComponent } from '../../shared/ui/arrow-up-right/arrow-up-right.component';
import { DatePipe } from '@angular/common';
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
import { EMPTY, Subscription } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';

import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import {
    TournamentChampion,
    TournamentChampionPlayer,
} from '../../entities/tournaments/model/tournament-champion.model';

@Component({
    selector: 'app-season-champion-page',
    imports: [ArrowUpRightComponent, DatePipe, RouterLink],
    templateUrl: './season-champion-page.component.html',
    styleUrl: './season-champion-page.component.scss',
})
export class SeasonChampionPageComponent implements OnInit {
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly destroyRef = inject(DestroyRef);
    private loadSubscription?: Subscription;

    readonly data = signal<TournamentChampion | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);
    readonly failedPlayerPhotoIds = signal<Set<number>>(new Set());
    readonly teamLogoFailed = signal(false);
    readonly champion = computed(() => this.data()?.champion ?? null);

    private readonly positionLabels: Record<
        NonNullable<TournamentChampionPlayer['position']>,
        string
    > = {
        goalkeeper: 'Вратарь',
        defender: 'Защитник',
        winger: 'Полузащитник',
        forward: 'Нападающий',
    };

    ngOnInit(): void {
        this.loadChampion();
    }

    loadChampion(): void {
        this.loadSubscription?.unsubscribe();
        this.isLoading.set(true);
        this.error.set(null);
        this.data.set(null);
        this.teamLogoFailed.set(false);
        this.failedPlayerPhotoIds.set(new Set());

        this.loadSubscription = this.tournamentsApi
            .getActiveTournament()
            .pipe(
                switchMap((tournament) => {
                    if (!tournament) {
                        this.error.set('Активный сезон не найден');
                        return EMPTY;
                    }
                    return this.tournamentsApi.getChampion(tournament.id);
                }),
                tap((data) => this.data.set(data)),
                catchError(() => {
                    this.error.set(
                        'Не удалось загрузить страницу чемпиона сезона',
                    );
                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    getMediaUrl(path: string): string {
        if (/^https?:\/\//i.test(path)) return path;
        return path.startsWith('/') ? path : `/${path}`;
    }

    getInitials(name: string): string {
        return name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toLocaleUpperCase('ru');
    }

    getPositionLabel(position: TournamentChampionPlayer['position']): string {
        return position ? this.positionLabels[position] : 'Игрок';
    }

    getAppearancesLabel(appearances: number): string {
        const mod100 = appearances % 100;
        const mod10 = appearances % 10;
        if (mod100 >= 11 && mod100 <= 14) return `${appearances} матчей`;
        if (mod10 === 1) return `${appearances} матч`;
        if (mod10 >= 2 && mod10 <= 4) return `${appearances} матча`;
        return `${appearances} матчей`;
    }

    markPlayerPhotoFailed(playerId: number): void {
        const failedIds = new Set(this.failedPlayerPhotoIds());
        failedIds.add(playerId);
        this.failedPlayerPhotoIds.set(failedIds);
    }
}
