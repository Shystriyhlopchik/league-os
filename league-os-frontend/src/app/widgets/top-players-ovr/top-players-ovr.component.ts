import {
    ChangeDetectionStrategy,
    Component,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { PlayerCardsApi } from '../../entities/player-card/api/player-cards.api';
import { PlayerCard } from '../../entities/player-card/model/player-card.types';

@Component({
    selector: 'app-top-players-ovr',
    imports: [RouterLink],
    templateUrl: './top-players-ovr.component.html',
    styleUrl: './top-players-ovr.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopPlayersOvrComponent {
    private readonly api = inject(PlayerCardsApi);

    readonly tournamentId = input.required<number>();
    readonly players = signal<PlayerCard[]>([]);
    readonly isLoading = signal(true);
    readonly hasError = signal(false);
    readonly failedPhotoIds = signal<Set<number>>(new Set());

    constructor() {
        effect((onCleanup) => {
            this.isLoading.set(true);
            this.hasError.set(false);

            const subscription = this.api
                .getTournamentCards(this.tournamentId())
                .subscribe({
                    next: ({ players }) => {
                        this.players.set(players.slice(0, 10));
                        this.isLoading.set(false);
                    },
                    error: () => {
                        this.players.set([]);
                        this.hasError.set(true);
                        this.isLoading.set(false);
                    },
                });

            onCleanup(() => subscription.unsubscribe());
        });
    }

    getMediaUrl(url: string): string {
        if (/^https?:\/\//i.test(url)) return url;
        return url.startsWith('/') ? url : `/${url}`;
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
}
