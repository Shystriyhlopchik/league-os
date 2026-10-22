import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, Subscription } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PlayerCardsApi } from '../../entities/player-card/api/player-cards.api';
import {
    PlayerCard,
    PlayerCardPosition,
} from '../../entities/player-card/model/player-card.types';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';

type PositionFilter = 'ALL' | PlayerCardPosition;

@Component({
    selector: 'app-players-page',
    imports: [FormsModule],
    templateUrl: './players-page.component.html',
    styleUrl: './players-page.component.scss',
})
export class PlayersPageComponent implements OnInit {
    private readonly pageSize = 24;
    private readonly playerCardsApi = inject(PlayerCardsApi);
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly destroyRef = inject(DestroyRef);
    private loadSubscription?: Subscription;

    readonly cards = signal<PlayerCard[]>([]);
    readonly tournamentName = signal<string | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);
    readonly search = signal('');
    readonly position = signal<PositionFilter>('ALL');
    readonly visibleCount = signal(this.pageSize);
    readonly failedPhotoIds = signal<Set<number>>(new Set());
    readonly ratingDescriptions = {
        ovr: 'Общий рейтинг игрока относительно футболистов той же позиции.',
        att: 'Атакующая результативность: голы и среднее количество голов за матч.',
        cre: 'Созидание: голевые передачи и среднее количество ассистов за матч.',
        form: 'Текущая форма: голы и ассисты в последних пяти сыгранных матчах.',
        exp: 'Опыт: количество завершённых матчей, в протоколе которых участвовал игрок.',
        disc: 'Дисциплина: рейтинг уменьшается за жёлтые, вторые жёлтые, красные карточки и дисквалификации.',
        imp: 'Влияние на атаку: общее количество голевых действий — голы плюс ассисты.',
    } as const;

    readonly positionFilters: ReadonlyArray<{
        value: PositionFilter;
        label: string;
    }> = [
        { value: 'ALL', label: 'Все' },
        { value: 'GK', label: 'Вратари' },
        { value: 'DF', label: 'Защитники' },
        { value: 'MF', label: 'Полузащитники' },
        { value: 'FW', label: 'Нападающие' },
    ];

    readonly filteredCards = computed(() => {
        const query = this.search().trim().toLocaleLowerCase('ru');
        const position = this.position();

        return this.cards().filter(
            (card) =>
                (position === 'ALL' || card.position === position) &&
                (!query ||
                    card.name.toLocaleLowerCase('ru').includes(query) ||
                    card.team.name.toLocaleLowerCase('ru').includes(query)),
        );
    });

    readonly visibleCards = computed(() =>
        this.filteredCards().slice(0, this.visibleCount()),
    );

    readonly hasMoreCards = computed(
        () => this.visibleCount() < this.filteredCards().length,
    );

    readonly isEmpty = computed(
        () =>
            !this.isLoading() &&
            !this.error() &&
            this.filteredCards().length === 0,
    );

    ngOnInit(): void {
        this.loadCards();
    }

    loadCards(): void {
        this.loadSubscription?.unsubscribe();
        this.isLoading.set(true);
        this.error.set(null);

        this.loadSubscription = this.tournamentsApi
            .getActiveTournament()
            .pipe(
                tap((tournament) =>
                    this.tournamentName.set(tournament?.name ?? null),
                ),
                switchMap((tournament) => {
                    if (!tournament) {
                        this.cards.set([]);
                        this.error.set('Активный турнир не найден');
                        return EMPTY;
                    }

                    return this.playerCardsApi.getTournamentCards(
                        tournament.id,
                    );
                }),
                tap((response) => {
                    this.cards.set(response.players);
                    this.tournamentName.set(response.tournamentName);
                }),
                catchError(() => {
                    this.cards.set([]);
                    this.error.set('Не удалось загрузить карточки игроков');
                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    setSearch(value: string): void {
        this.search.set(value);
        this.visibleCount.set(this.pageSize);
    }

    setPosition(value: PositionFilter): void {
        this.position.set(value);
        this.visibleCount.set(this.pageSize);
    }

    showMore(): void {
        this.visibleCount.update((count) => count + this.pageSize);
    }

    getPhotoUrl(photoUrl: string): string {
        if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
        return photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`;
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

    markPhotoAsFailed(playerId: number): void {
        const failedIds = new Set(this.failedPhotoIds());
        failedIds.add(playerId);
        this.failedPhotoIds.set(failedIds);
    }

    cardTier(ovr: number): string {
        if (ovr >= 90) return 'elite';
        if (ovr >= 80) return 'gold';
        if (ovr >= 70) return 'silver';
        return 'bronze';
    }

    pluralForm(
        value: number,
        one: string,
        few: string,
        many: string,
    ): string {
        const absolute = Math.abs(value) % 100;
        const lastDigit = absolute % 10;

        if (absolute > 10 && absolute < 20) return many;
        if (lastDigit === 1) return one;
        if (lastDigit >= 2 && lastDigit <= 4) return few;
        return many;
    }
}
