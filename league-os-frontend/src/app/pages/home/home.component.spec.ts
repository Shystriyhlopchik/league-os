import { NO_ERRORS_SCHEMA } from '@angular/core';
import {
    ComponentFixture,
    fakeAsync,
    TestBed,
    tick,
} from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { HomeComponent } from './home.component';

describe('Yard editorial home', () => {
    let fixture: ComponentFixture<HomeComponent>;
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [HomeComponent],
            providers: [
                provideRouter([]),
                {
                    provide: TournamentsApi,
                    useValue: { getActiveTournament: () => of(null) },
                },
                {
                    provide: StandingsApi,
                    useValue: { getPublicTournamentView: () => of(null) },
                },
            ],
        })
            .overrideComponent(HomeComponent, {
                set: { imports: [RouterLink], schemas: [NO_ERRORS_SCHEMA] },
            })
            .compileComponents();
        fixture = TestBed.createComponent(HomeComponent);
        fixture.detectChanges();
    });
    it('uses a real match photo and preserves its attribution', () => {
        const img = fixture.nativeElement.querySelector('.league-intro__photo');
        expect(img.getAttribute('src')).toBe('brand/photos/match-action.jpg');
        expect(img.getAttribute('fetchpriority')).toBe('high');
        expect(fixture.nativeElement.textContent).toContain(
            'IVANOV / GEOMETRIA',
        );
    });
    it('keeps calendar and team navigation and does not invent tournament results', () => {
        expect(
            fixture.nativeElement.querySelector('a[href="/matches"]'),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('a[href="/team"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.home-matches')).toBeNull();
    });
    it('lets users pause and resume the decorative moving strip', () => {
        const button: HTMLButtonElement =
            fixture.nativeElement.querySelector('.yard-line button');
        button.click();
        fixture.detectChanges();
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(
            fixture.nativeElement.querySelector('.yard-line--paused'),
        ).not.toBeNull();
        button.click();
        fixture.detectChanges();
        expect(button.getAttribute('aria-pressed')).toBe('false');
    });
    it('uses two identical groups of unbroken phrases for a seamless loop', () => {
        const groups: HTMLElement[] = [
            ...fixture.nativeElement.querySelectorAll('.yard-line__group'),
        ];
        expect(groups.length).toBe(2);
        expect(groups[0].textContent).toBe(groups[1].textContent);
        expect(groups[0].querySelectorAll('.yard-line__phrase').length).toBe(3);
        expect(
            fixture.nativeElement.querySelector('.yard-line__viewport button'),
        ).toBeNull();
    });
    it('lazy-loads the editorial image below the fold', () => {
        expect(
            fixture.nativeElement
                .querySelector('.yard-story img')
                .getAttribute('loading'),
        ).toBe('lazy');
    });
    it('shows only the active photo to assistive technology', () => {
        const images: HTMLImageElement[] = [
            ...fixture.nativeElement.querySelectorAll('.league-intro__photo'),
        ];
        expect(images.length).toBe(3);
        expect(
            images.filter((i) => !i.hasAttribute('aria-hidden')).length,
        ).toBe(1);
    });
    it('cycles both ways with manual controls and pauses autoplay', () => {
        const component = fixture.componentInstance;
        [0, 1, 2].forEach((i) => component.markIntroLoaded(i));
        fixture.detectChanges();
        fixture.nativeElement
            .querySelector('[aria-label="Следующая фотография"]')
            .click();
        fixture.detectChanges();
        expect(component.activeIntroSlide()).toBe(1);
        expect(component.introPaused()).toBeTrue();
        expect(
            fixture.nativeElement
                .querySelector('.league-intro__photo--active')
                .getAttribute('src'),
        ).toBe('brand/photos/match-duel.jpg');
        component.stepIntro(-1);
        component.stepIntro(-1);
        expect(component.activeIntroSlide()).toBe(2);
    });
    it('advances automatically after 6.5 seconds and stops on pause', fakeAsync(() => {
        const component = fixture.componentInstance;
        [0, 1, 2].forEach((i) => component.markIntroLoaded(i));
        fixture.detectChanges();
        tick(6499);
        expect(component.activeIntroSlide()).toBe(0);
        tick(1);
        fixture.detectChanges();
        expect(component.activeIntroSlide()).toBe(1);
        component.introPaused.set(true);
        fixture.detectChanges();
        tick(13000);
        expect(component.activeIntroSlide()).toBe(1);
        fixture.destroy();
    }));
    it('respects reduced motion and keyboard focus', fakeAsync(() => {
        const component = fixture.componentInstance;
        [0, 1, 2].forEach((i) => component.markIntroLoaded(i));
        component.introReducedMotion.set(true);
        fixture.detectChanges();
        tick(7000);
        expect(component.activeIntroSlide()).toBe(0);
        expect(
            fixture.nativeElement.querySelector(
                '[aria-label="Приостановить автосмену фотографий"]',
            ),
        ).toBeNull();
        component.introReducedMotion.set(false);
        component.introFocused.set(true);
        fixture.detectChanges();
        tick(7000);
        expect(component.activeIntroSlide()).toBe(0);
        component.introFocused.set(false);
        fixture.detectChanges();
        tick(6500);
        expect(component.activeIntroSlide()).toBe(1);
        fixture.destroy();
    }));
    it('does not switch to an unloaded or failed image', () => {
        const component = fixture.componentInstance;
        component.markIntroLoaded(0);
        component.stepIntro(1);
        expect(component.activeIntroSlide()).toBe(0);
        component.markIntroLoaded(2);
        component.stepIntro(1);
        expect(component.activeIntroSlide()).toBe(2);
        component.markIntroFailed(2);
        expect(component.activeIntroSlide()).toBe(0);
    });
});
