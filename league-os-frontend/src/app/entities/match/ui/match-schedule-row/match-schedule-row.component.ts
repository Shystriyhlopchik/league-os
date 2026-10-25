import { DatePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
    signal,
} from '@angular/core';
import { MatchCardVm } from '../../model/match-card.vm';

@Component({
    selector: 'app-match-schedule-row',
    imports: [DatePipe],
    templateUrl: './match-schedule-row.component.html',
    styleUrl: './match-schedule-row.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchScheduleRowComponent {
    readonly match = input.required<MatchCardVm>();
    readonly cardClick = output<number>();
    readonly failedLogos = signal<Set<string>>(new Set());
    readonly showScore = computed(() =>
        ['finished', 'live'].includes(this.match().status),
    );
    readonly statusLabel = computed(
        () =>
            ({
                scheduled: 'Начало матча',
                live: 'Идёт матч',
                finished: 'Матч окончен',
                cancelled: 'Отменён',
            })[this.match().status],
    );
    readonly roundLabel = computed(() => {
        const round = this.match().round;
        const labels: Record<string, string> = {
            round_of_32: '1/16 финала',
            round_of_16: '1/8 финала',
            quarter_final: 'Четвертьфинал',
            semi_final: 'Полуфинал',
            third_place: 'За 3-е место',
            final: 'Финал',
        };
        const [type, position] = round.split(':');
        if (!labels[type]) return round;
        if (!position || position === 'FINAL' || position === 'THIRD_PLACE')
            return labels[type];
        const tie = /^(?:QF|SF|R16|R32)-(\d+)(?:-L([12]))?$/.exec(position);
        return tie
            ? `${labels[type]} №${tie[1]}${tie[2] ? ' · ' + (tie[2] === '1' ? 'первый матч' : 'ответный матч') : ''}`
            : `${labels[type]} · ${position}`;
    });

    logoUrl(url: string): string {
        return /(^|\/)brand\/logos\/mark_white\.svg$/.test(url)
            ? '/brand/logos/mark_black.svg'
            : url;
    }

    markLogoFailed(url: string): void {
        this.failedLogos.update((urls) => new Set([...urls, url]));
    }
}
