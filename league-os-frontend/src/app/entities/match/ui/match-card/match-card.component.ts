import {Component, input, output} from '@angular/core';
import { MatchCardVm } from '../../model/match-card.vm';
import {DatePipe} from '@angular/common';

@Component({
    selector: 'app-match-card',
    imports: [DatePipe],
    templateUrl: './match-card.component.html',
    styleUrl: './match-card.component.scss',
})
export class MatchCardComponent {
    readonly match = input.required<MatchCardVm>();
    readonly cardClick = output<number | string>();

    onCardClick(): void {
        this.cardClick.emit(this.match().id);
    }
}
