import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PlayersApi } from '../../entities/player/api/players.api';
import { PlayerTickerItem } from '../../entities/player/model/player-ticker.types';

@Component({
    selector: 'app-advertising-banner',
    standalone: true,
    templateUrl: './advertising-banner.component.html',
    styleUrl: './advertising-banner.component.scss',
})
export class AdvertisingBannerComponent implements OnInit {
    private readonly api = inject(PlayersApi);
    private readonly destroyRef = inject(DestroyRef);

    readonly players = signal<PlayerTickerItem[]>([]);
    readonly birthdays = signal<PlayerTickerItem[]>([]);
    readonly isLoading = signal(true);
    readonly hasError = signal(false);

    readonly hasBirthdays = computed(() => this.birthdays().length > 0);
    readonly baseItems = computed(() =>
        this.hasBirthdays()
            ? this.birthdays().map(
                  (player) => `С днём рождения, ${player.name}!`,
              )
            : this.players().map((player) => player.name),
    );
    readonly tickerItems = computed(() => {
        const items = this.baseItems();
        if (!items.length) return [];

        const repeatCount = Math.max(1, Math.ceil(6 / items.length));
        return Array.from({ length: repeatCount }, () => items).flat();
    });
    readonly tickerDuration = computed(
        () => `${Math.max(18, this.tickerItems().length * 3.5)}s`,
    );
    readonly accessibleText = computed(() =>
        this.hasBirthdays()
            ? this.baseItems().join(' ')
            : `Игроки лиги: ${this.baseItems().join(', ')}`,
    );

    ngOnInit(): void {
        this.api
            .getTicker()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: ({ players, birthdays }) => {
                    this.players.set(players);
                    this.birthdays.set(birthdays);
                    this.isLoading.set(false);
                },
                error: () => {
                    this.hasError.set(true);
                    this.isLoading.set(false);
                },
            });
    }
}
