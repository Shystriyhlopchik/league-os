import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
} from '@angular/core';
import {
    PlayerLeaderboardEntry,
    PlayerLeaderboardMetric,
} from '../../entities/tournaments/model/player-leader.types';
import { SectionTitleComponent } from '../../shared/ui/section-title/section-title.component';

const METRIC_TITLES: Record<PlayerLeaderboardMetric, string> = {
    goals: 'Голы',
    assists: 'Ассисты',
    yellowCards: 'Жёлтые карточки',
    redCards: 'Красные карточки',
    goalContributions: 'Гол + пас',
    goalsPerGame: 'Среднее голов за игру',
};

@Component({
    selector: 'app-player-leaders-card',
    standalone: true,
    templateUrl: './player-leaders-card.component.html',
    styleUrl: './player-leaders-card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SectionTitleComponent],
})
export class PlayerLeadersCardComponent {
    readonly metric = input<PlayerLeaderboardMetric>('goals');
    readonly leaders = input<readonly PlayerLeaderboardEntry[]>([]);
    readonly isLoading = input(false);
    readonly hasError = input(false);

    readonly title = computed(() => METRIC_TITLES[this.metric()]);
    readonly leader = computed(() => this.leaders()[0] ?? null);

    useFallbackImage(event: Event, fallbackUrl: string): void {
        const image = event.target as HTMLImageElement;
        if (!image.src.endsWith(fallbackUrl)) {
            image.src = fallbackUrl;
        }
    }
}
