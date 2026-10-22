import { Component, computed, inject, signal } from '@angular/core';
import { TabGroupItem } from '../../../../shared/ui/tab-group/model/tab-group.types';
import { MatchViewProtocolStore } from '../../model/match-view-protocol.store';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatchProtocolEvent } from '../../../../entities/match/model/match-protocol.types';
import { TabGroupComponent } from '../../../../shared/ui/tab-group/tab-group.component';
import { MatchScoreboardComponent } from '../../../../entities/match/ui/match-scoreboard/match-scoreboard.component';
import { mapProtocolMatchToScoreboardVm } from '../../../../entities/match/model/match-scoreboard.mapper';

type MatchProtocolTab = 'events' | 'rosters';
type MatchEventVisual =
    | 'ball'
    | 'yellow-card'
    | 'red-card'
    | 'double-card'
    | 'start'
    | 'pause'
    | 'finish'
    | 'default';

@Component({
    selector: 'app-match-view-protocol-page',
    imports: [TabGroupComponent, RouterLink, MatchScoreboardComponent],
    templateUrl: './match-view-protocol-page.component.html',
    styleUrl: './match-view-protocol-page.component.scss',
})
export class MatchViewProtocolPageComponent {
    private readonly route = inject(ActivatedRoute);

    readonly store = inject(MatchViewProtocolStore);

    readonly activeTab = signal<MatchProtocolTab>('events');

    readonly scoreboardVm = computed(() => {
        const match = this.store.match();

        if (!match) {
            return null;
        }

        return mapProtocolMatchToScoreboardVm(match);
    });

    readonly tabs: TabGroupItem<MatchProtocolTab>[] = [
        {
            label: 'События',
            value: 'events',
        },
        {
            label: 'Состав',
            value: 'rosters',
        },
    ];

    constructor() {
        const matchId = this.route.snapshot.paramMap.get('matchId');

        if (matchId) {
            this.store.load(matchId);
        }
    }

    selectTab(tab: MatchProtocolTab): void {
        this.activeTab.set(tab);
    }

    getEventTitle(event: MatchProtocolEvent): string {
        switch (event.type) {
            case 'goal':
                return 'Гол';

            case 'own_goal':
                return 'Автогол';

            case 'yellow_card':
                return 'Жёлтая карточка';

            case 'red_card':
                return 'Красная карточка';

            case 'red_ball':
                return 'Красный мяч';

            case 'second_yellow':
            case 'second_yellow_card':
                return 'Вторая жёлтая карточка';

            case 'penalty':
                return 'Пенальти';

            case 'goal_cancelled':
                return 'Гол отменён';

            case 'match_started':
                return 'Матч начался';

            case 'match_paused':
                return 'Матч приостановлен';

            case 'half_finished':
                return 'Тайм завершён';

            case 'match_finished':
                return 'Матч завершён';

            default:
                return event.description || 'Событие матча';
        }
    }

    getPlayerName(player: MatchProtocolEvent['player']): string {
        if (!player) {
            return '';
        }

        return [player.lastName, player.firstName, player.middleName]
            .filter(Boolean)
            .join(' ');
    }

    getEventVisual(event: MatchProtocolEvent): MatchEventVisual {
        switch (event.type) {
            case 'goal':
            case 'own_goal':
            case 'penalty':
            case 'goal_cancelled':
            case 'red_ball':
                return 'ball';
            case 'yellow_card':
                return 'yellow-card';
            case 'red_card':
                return 'red-card';
            case 'second_yellow':
            case 'second_yellow_card':
                return 'double-card';
            case 'match_started':
                return 'start';
            case 'match_paused':
                return 'pause';
            case 'half_finished':
            case 'match_finished':
                return 'finish';
            default:
                return 'default';
        }
    }

    getMatchStatusLabel(): string {
        switch (this.store.match()?.status) {
            case 'scheduled':
                return 'Матч запланирован';
            case 'live':
                return 'Матч идёт';
            case 'finished':
                return 'Матч завершён';
            case 'cancelled':
                return 'Матч отменён';
            default:
                return '';
        }
    }

    getEventTime(event: MatchProtocolEvent): string {
        if (event.minute === null || event.minute === undefined) {
            return '—';
        }

        if (event.addedMinute) {
            return `${event.minute}+${event.addedMinute}'`;
        }

        return `${event.minute}'`;
    }
}
