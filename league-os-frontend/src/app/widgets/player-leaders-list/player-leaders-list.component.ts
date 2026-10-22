import {
    ChangeDetectionStrategy,
    Component,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { PlayerLeadersApi } from '../../entities/tournaments/api/player-leaders.api';
import {
    PLAYER_LEADERBOARD_METRICS,
    PlayerLeaderboardMetric,
    PlayerLeaderboards,
} from '../../entities/tournaments/model/player-leader.types';
import { PlayerLeadersCardComponent } from '../player-leaders-card/player-leaders-card.component';

@Component({
    selector: 'app-player-leaders-list',
    standalone: true,
    imports: [PlayerLeadersCardComponent],
    templateUrl: './player-leaders-list.component.html',
    styleUrl: './player-leaders-list.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerLeadersListComponent {
    private readonly api = inject(PlayerLeadersApi);

    readonly tournamentId = input.required<number>();
    readonly groupId = input<number | null>(null);
    readonly metrics = input<readonly PlayerLeaderboardMetric[]>(
        PLAYER_LEADERBOARD_METRICS,
    );

    readonly leaderboards = signal<PlayerLeaderboards | null>(null);
    readonly isLoading = signal(true);
    readonly hasError = signal(false);

    constructor() {
        effect((onCleanup) => {
            const tournamentId = this.tournamentId();
            const groupId = this.groupId();

            this.isLoading.set(true);
            this.hasError.set(false);

            const subscription = this.api
                .getLeaderboards(tournamentId, groupId ?? undefined)
                .subscribe({
                    next: ({ leaderboards }) => {
                        this.leaderboards.set(leaderboards);
                        this.isLoading.set(false);
                    },
                    error: () => {
                        this.leaderboards.set(null);
                        this.hasError.set(true);
                        this.isLoading.set(false);
                    },
                });

            onCleanup(() => subscription.unsubscribe());
        });
    }
}
