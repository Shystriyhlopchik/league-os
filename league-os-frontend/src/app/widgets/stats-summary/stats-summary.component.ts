import {
    ChangeDetectionStrategy,
    Component,
    effect,
    inject,
    input,
    Input,
} from '@angular/core';
import { SectionTitleComponent } from '../../shared/ui/section-title/section-title.component';
import { StatsSummaryStore } from './model/stats-summary.store';

export interface StatsSummaryData {
    played: number;
    wins: number;
    draws: number;
    remaining: number;
    penalties: number;
    assists: number;
    goals: number;
    yellowCards: number;
    redCards: number;
}

type StatsSummaryItemKey = keyof StatsSummaryData;

interface StatsSummaryItem {
    key: StatsSummaryItemKey;
    label: string;
    modifier: string;
}

@Component({
    selector: 'app-stats-summary',
    standalone: true,
    imports: [SectionTitleComponent],
    templateUrl: './stats-summary.component.html',
    styleUrl: './stats-summary.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [StatsSummaryStore]
})
export class StatsSummaryComponent {
    readonly tournamentId = input.required<number>();
    readonly title = input('Статистика сезона');

    readonly store = inject(StatsSummaryStore);

    readonly items: StatsSummaryItem[] = [
        { key: 'played', label: 'Игр сыграно', modifier: 'played' },
        { key: 'wins', label: 'Победы', modifier: 'wins' },
        { key: 'draws', label: 'Ничьи', modifier: 'draws' },
        { key: 'remaining', label: 'Осталось сыграть', modifier: 'remaining' },
        { key: 'penalties', label: 'Пенальти', modifier: 'penalties' },
        { key: 'assists', label: 'Ассисты', modifier: 'assists' },
        { key: 'goals', label: 'Голы', modifier: 'goals' },
        {
            key: 'yellowCards',
            label: 'Жёлтые карточки',
            modifier: 'yellow-cards',
        },
        { key: 'redCards', label: 'Красные карточки', modifier: 'red-cards' },
    ];

    constructor() {
        effect(() => {
            this.store.loadStats(this.tournamentId());
        });
    }
}
