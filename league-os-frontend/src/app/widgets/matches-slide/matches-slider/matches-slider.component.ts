import {
    Component, computed,
    CUSTOM_ELEMENTS_SCHEMA,
    effect,
    ElementRef,
    inject,
    input,
    ViewChild,
} from '@angular/core';
import { MatchCardComponent } from '../../../entities/match/ui/match-card/match-card.component';
import { MatchesSliderStore } from '../model/matches-slider.store';
import {Router} from '@angular/router';

@Component({
    selector: 'app-matches-slider',
    imports: [ MatchCardComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [MatchesSliderStore],
    templateUrl: './matches-slider.component.html',
    styleUrl: './matches-slider.component.scss',
})
export class MatchesSliderComponent {
    private readonly store = inject(MatchesSliderStore);

    readonly seasonId = input.required<number | string>();
    private readonly router = inject(Router);

    readonly matches = this.store.matches;
    readonly isLoading = this.store.isLoading;
    readonly isEmpty = this.store.isEmpty;
    readonly error = this.store.error;

    readonly initialSlideIndex = computed(() => {
        const index = this.matches().findIndex(
            (match) => match.status === 'scheduled',
        );

        return index === -1 ? this.matches().length-1 : index-1;
    });

    constructor() {
        effect(() => {
            this.store.loadBySeason(this.seasonId());
        });
    }

    @ViewChild('swiperEl')
    set swiperElement(elementRef: ElementRef<HTMLElement> | undefined) {
        if (!elementRef) return;

        const swiperEl = elementRef.nativeElement as any;

        Object.assign(swiperEl, {
            loop: false,
            spaceBetween: 25,
            slidesPerView: 'auto',
            initialSlide: this.initialSlideIndex(),
        });

        swiperEl.initialize();
    }

    openProtocol(matchId: number | string): void {
        this.router.navigate(['/matches', matchId, 'protocol']);
    }
}
