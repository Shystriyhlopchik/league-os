import {
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    ElementRef,
    ViewChild,
} from '@angular/core';
import { MatchService } from '../../../core/services/match.service';
import { AsyncPipe, DatePipe } from '@angular/common';
import { MatchCardComponent } from '../../../entities/match/ui/match-card/match-card.component';

@Component({
    selector: 'app-matches-slider',
    imports: [AsyncPipe, DatePipe, MatchCardComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    templateUrl: './matches-slider.component.html',
    styleUrl: './matches-slider.component.scss',
})
export class MatchesSliderComponent {
    initialSlideIndex = 19;

    matches$ = this.matchService.matches$;

    constructor(private readonly matchService: MatchService) {}

    @ViewChild('swiperEl')
    set swiperElement(elementRef: ElementRef<HTMLElement> | undefined) {
        if (!elementRef) return;

        const swiperEl = elementRef.nativeElement as any;
        swiperEl.initialize?.();
    }
}
