import { Component, input } from '@angular/core';
import { MatchCardVm } from '../../model/match-card.vm';

@Component({
    selector: 'app-match-card',
    imports: [],
    templateUrl: './match-card.component.html',
    styleUrl: './match-card.component.scss',
})
export class MatchCardComponent {
    readonly match = input.required<MatchCardVm>();
}
