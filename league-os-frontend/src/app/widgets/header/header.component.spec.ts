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
    afterEach(() => fixture.destroy());
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
            '/videos',
            '/regulations',
        ]) {
            expect(
                fixture.nativeElement.querySelector(`a[href="${path}"]`),
            ).not.toBeNull();
        }
    });
    it('organizes desktop navigation into three disclosure groups', () => {
        const toggles = fixture.nativeElement.querySelectorAll(
            '.header__group-toggle',
        );
        expect(
            Array.from(toggles).map((toggle: any) =>
                toggle.textContent.trim().replace(/\s*⌄$/, ''),
            ),
        ).toEqual(['Турнир', 'Участники', 'Медиа']);
        const media = fixture.nativeElement.querySelector(
            '#header-group-media',
        );
        expect(media.getAttribute('aria-expanded')).toBe('false');
        expect(
            fixture.nativeElement.querySelector('#header-links-media').hidden,
        ).toBeTrue();
        media.click();
        fixture.detectChanges();
        expect(media.getAttribute('aria-expanded')).toBe('true');
        expect(
            fixture.nativeElement.querySelector('#header-links-media').hidden,
        ).toBeFalse();
        fixture.nativeElement.querySelector('#header-group-tournament').click();
        fixture.detectChanges();
        expect(media.getAttribute('aria-expanded')).toBe('false');
    });
    it('closes a dropdown on Escape and returns focus to its toggle', () => {
        const focus = spyOn(
            fixture.nativeElement.querySelector('#header-group-media'),
            'focus',
        );
        fixture.componentInstance.toggleGroup('media');
        fixture.detectChanges();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        fixture.detectChanges();
        expect(fixture.componentInstance.openGroup()).toBeNull();
        expect(focus).toHaveBeenCalled();
    });
    it('closes dropdowns after clicking outside or tabbing outside the group', () => {
        fixture.componentInstance.toggleGroup('media');
        document.body.click();
        expect(fixture.componentInstance.openGroup()).toBeNull();
        fixture.componentInstance.toggleGroup('media');
        fixture.detectChanges();
        fixture.nativeElement
            .querySelector('#header-group-media')
            .dispatchEvent(
                new FocusEvent('focusout', {
                    bubbles: true,
                    relatedTarget: document.body,
                }),
            );
        expect(fixture.componentInstance.openGroup()).toBeNull();
    });
    it('shows all groups expanded on mobile and closes after a link is selected', () => {
        fixture.componentInstance.toggleMenu();
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelectorAll(
                '#header-menu .header__mobile-group',
            ).length,
        ).toBe(3);
        const video = fixture.nativeElement.querySelector(
            '#header-menu a[href="/videos"]',
        );
        expect(video).not.toBeNull();
        video.addEventListener('click', (event: MouseEvent) =>
            event.preventDefault(),
        );
        video.dispatchEvent(
            new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                ctrlKey: true,
            }),
        );
        fixture.detectChanges();
        expect(fixture.componentInstance.isMenuOpen()).toBeFalse();
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
        expect(
            link
                .closest('.header__group')
                .classList.contains('header__group--active'),
        ).toBeTrue();
    });
});
