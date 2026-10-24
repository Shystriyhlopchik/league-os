import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HeaderComponent } from './header.component';

describe('Brand header navigation', () => {
    let fixture: ComponentFixture<HeaderComponent>;
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [HeaderComponent],
            providers: [provideRouter([{ path: 'matches', children: [] }])],
        }).compileComponents();
        fixture = TestBed.createComponent(HeaderComponent);
        fixture.detectChanges();
    });
    it('uses the supplied vector identity and retains the public routes', () => {
        expect(
            fixture.nativeElement
                .querySelector('.header__logo-image')
                .getAttribute('src'),
        ).toBe('brand/logos/horizontal_white.svg');
        for (const path of [
            '/team',
            '/players',
            '/matches',
            '/statistics',
            '/ranking',
            '/champion',
            '/news',
            '/regulations',
        ]) {
            expect(
                fixture.nativeElement.querySelector(`a[href="${path}"]`),
            ).not.toBeNull();
        }
    });
    it('opens and closes mobile navigation and restores body scrolling', () => {
        const before = document.body.style.overflow;
        const toggle = fixture.nativeElement.querySelector(
            '.header__action--menu',
        );
        toggle.click();
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(document.body.style.overflow).toBe('hidden');
        expect(
            fixture.nativeElement.querySelector('#header-menu'),
        ).not.toBeNull();
        toggle.click();
        fixture.detectChanges();
        expect(document.body.style.overflow).toBe(before);
        expect(fixture.nativeElement.querySelector('#header-menu')).toBeNull();
    });
    it('closes the menu on Escape', () => {
        fixture.componentInstance.toggleMenu();
        fixture.detectChanges();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        fixture.detectChanges();
        expect(fixture.componentInstance.isMenuOpen()).toBeFalse();
    });
    it('matches the desktop breakpoint to the new navigation width', () => {
        const media = spyOn(window, 'matchMedia').and.returnValue({
            matches: true,
        } as MediaQueryList);
        fixture.componentInstance.toggleMenu();
        fixture.detectChanges();
        fixture.componentInstance.onViewportResize();
        fixture.detectChanges();
        expect(media).toHaveBeenCalledWith('(min-width: 1240px)');
        expect(fixture.componentInstance.isMenuOpen()).toBeFalse();
    });
    it('marks the current route for sighted users and screen readers', async () => {
        await TestBed.inject(Router).navigateByUrl('/matches');
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        const link = fixture.nativeElement.querySelector(
            '.header__nav--desktop a[href="/matches"]',
        );
        expect(link.classList.contains('header__nav-link--active')).toBeTrue();
        expect(link.getAttribute('aria-current')).toBe('page');
    });
});
