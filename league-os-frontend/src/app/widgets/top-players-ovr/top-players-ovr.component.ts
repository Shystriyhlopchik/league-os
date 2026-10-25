import { DOCUMENT } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    inject,
    input,
    signal,
    ViewChild,
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
    private readonly document = inject(DOCUMENT);
    @ViewChild('spotlight') private spotlight?: ElementRef<HTMLElement>;

    readonly tournamentId = input.required<number>();
    readonly players = signal<PlayerCard[]>([]);
    readonly isLoading = signal(true);
    readonly hasError = signal(false);
    readonly failedPhotoIds = signal<Set<number>>(new Set());
    readonly selectedPlayerId = signal<number | null>(null);
    readonly tournamentName = signal('');
    private readonly refresh = signal(0);
    readonly selectedPlayer = computed<PlayerCard | null>(
        () =>
            this.players().find(
                (player) => player.playerId === this.selectedPlayerId(),
            ) ??
            this.players()[0] ??
            null,
    );
    readonly selectedPlace = computed(
        () =>
            this.players().findIndex(
                (player) => player.playerId === this.selectedPlayer()?.playerId,
            ) + 1,
    );
    readonly panelId = computed(
        () => `top-player-spotlight-${this.tournamentId()}`,
    );

    constructor() {
        effect((onCleanup) => {
            this.refresh();
            this.isLoading.set(true);
            this.hasError.set(false);
            this.players.set([]);
            this.selectedPlayerId.set(null);
            this.failedPhotoIds.set(new Set());
            this.tournamentName.set('');

            const subscription = this.api
                .getTournamentCards(this.tournamentId())
                .subscribe({
                    next: ({ players, tournamentName }) => {
                        // Preserve the server's OVR order and tie-breakers.
                        const leaders = players.slice(0, 5);
                        this.players.set(leaders);
                        this.selectedPlayerId.set(leaders[0]?.playerId ?? null);
                        this.tournamentName.set(tournamentName);
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

    selectPlayer(playerId: number, reveal = false): void {
        if (!this.players().some((player) => player.playerId === playerId))
            return;
        this.selectedPlayerId.set(playerId);
        const view = this.document.defaultView;
        const panel = this.spotlight?.nativeElement;
        if (
            reveal &&
            view?.matchMedia('(max-width: 700px)').matches &&
            panel &&
            panel.getBoundingClientRect().top < 0
        ) {
            panel.scrollIntoView({
                block: 'start',
                behavior: view.matchMedia('(prefers-reduced-motion: reduce)')
                    .matches
                    ? 'instant'
                    : 'smooth',
            });
        }
    }

    reload(): void {
        this.refresh.update((value) => value + 1);
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
