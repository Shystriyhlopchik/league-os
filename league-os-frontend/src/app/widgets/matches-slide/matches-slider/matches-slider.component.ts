import {
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    effect,
    ElementRef,
    inject,
    input,
    ViewChild,
} from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { MatchCardComponent } from '../../../entities/match/ui/match-card/match-card.component';
import { MatchesSliderStore } from '../model/matches-slider.store';

@Component({
    selector: 'app-matches-slider',
    imports: [AsyncPipe, DatePipe, MatchCardComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [MatchesSliderStore],
    templateUrl: './matches-slider.component.html',
    styleUrl: './matches-slider.component.scss',
})
export class MatchesSliderComponent {
    private readonly store = inject(MatchesSliderStore);

    readonly tournamentId = input.required<number | string>();

    readonly matches = this.store.matches;
    readonly isLoading = this.store.isLoading;
    readonly isEmpty = this.store.isEmpty;
    readonly error = this.store.error;

    initialSlideIndex = 19;

    constructor() {
        effect(() => {
            this.store.loadByTournament(this.tournamentId());
        });
    }

    @ViewChild('swiperEl')
    set swiperElement(elementRef: ElementRef<HTMLElement> | undefined) {
        if (!elementRef) return;

        const swiperEl = elementRef.nativeElement as any;
        swiperEl.initialize?.();
    }
}
