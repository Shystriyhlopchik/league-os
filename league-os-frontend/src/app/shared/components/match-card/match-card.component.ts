import {
    AfterViewInit,
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    ElementRef,
    ViewChild,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatchService } from '../../../core/services/match.service';

@Component({
    selector: 'app-match-card',
    imports: [AsyncPipe],
    templateUrl: './match-card.component.html',
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    styleUrl: './match-card.component.scss',
})
export class MatchCardComponent implements AfterViewInit {
    @ViewChild('swiperEl', { static: false }) swiperRef!: ElementRef;

    matches$ = this.matchService.matches$;

    constructor(private matchService: MatchService) {}

    ngAfterViewInit(): void {
        if (this.swiperRef.nativeElement) {
            const swiperEl = this.swiperRef.nativeElement as any;

            // Важно: Swiper Web Component требует ручной инициализации параметров
            swiperEl.initialize?.(); // вызывает инициализацию, если она не была завершена
        }
    }
}
