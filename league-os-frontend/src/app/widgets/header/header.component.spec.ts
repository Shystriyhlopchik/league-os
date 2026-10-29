import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HeaderComponent } from './header.component';

describe('Brand header navigation', () => {
    let fixture: ComponentFixture<HeaderComponent>;
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [HeaderComponent],
            providers: [
                provideRouter([
                    { path: 'matches', children: [] },
                    { path: 'regulations', children: [] },
                    { path: 'about/philosophy', children: [] },
                    { path: 'about/history', children: [] },
                ]),
            ],
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
            '/about/philosophy',
            '/about/history',
        ]) {
            expect(
                fixture.nativeElement.querySelector(`a[href="${path}"]`),
            ).not.toBeNull();
        }
    });
    it('groups league links in a collapsed desktop submenu', () => {
        const group = fixture.nativeElement.querySelector(
            '.header__nav--desktop .header__about',
        );
        const toggle = group.querySelector('button');
        const list = group.querySelector('ul');
        expect(toggle.textContent).toContain('О лиге');
        expect(toggle.getAttribute('aria-controls')).toBe(list.id);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(list.hidden).toBeTrue();
        expect(
            Array.from(group.querySelectorAll('a')).map((a: any) =>
                a.getAttribute('href'),
            ),
        ).toEqual(['/regulations', '/about/philosophy', '/about/history']);
        toggle.click();
        fixture.detectChanges();
        expect(list.hidden).toBeFalse();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
    it('closes the submenu on an outside click', () => {
        fixture.componentInstance.isAboutOpen.set(true);
        fixture.detectChanges();
        document.body.click();
        fixture.detectChanges();
        expect(fixture.componentInstance.isAboutOpen()).toBeFalse();
    });
    it('closes only the submenu first on Escape and restores toggle focus', () => {
        fixture.componentInstance.toggleMenu();
        fixture.componentInstance.isAboutOpen.set(true);
        fixture.detectChanges();
        const toggle = fixture.nativeElement.querySelector(
            '#header-menu .header__about-toggle',
        );
        const focus = spyOn(toggle, 'focus');
        fixture.componentInstance.onEscape();
        fixture.detectChanges();
        expect(fixture.componentInstance.isAboutOpen()).toBeFalse();
        expect(fixture.componentInstance.isMenuOpen()).toBeTrue();
        expect(focus).toHaveBeenCalled();
        fixture.componentInstance.onEscape();
        expect(fixture.componentInstance.isMenuOpen()).toBeFalse();
    });
    it('closes the submenu when keyboard focus leaves the group', () => {
        fixture.componentInstance.isAboutOpen.set(true);
        fixture.detectChanges();
        const group = fixture.nativeElement.querySelector('.header__about');
        group.dispatchEvent(
            new FocusEvent('focusout', {
                relatedTarget: group.querySelector('a'),
            }),
        );
        expect(fixture.componentInstance.isAboutOpen()).toBeTrue();
        group.dispatchEvent(
            new FocusEvent('focusout', { relatedTarget: document.body }),
        );
        expect(fixture.componentInstance.isAboutOpen()).toBeFalse();
    });
    it('supports mobile submenu navigation and closes both levels after selection', async () => {
        fixture.componentInstance.toggleMenu();
        fixture.detectChanges();
        const mobile = fixture.nativeElement.querySelector('#header-menu');
        mobile.querySelector('.header__about-toggle').click();
        fixture.detectChanges();
        expect(mobile.querySelector('ul').hidden).toBeFalse();
        mobile.querySelector('a[href="/about/history"]').click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(fixture.componentInstance.isAboutOpen()).toBeFalse();
        expect(fixture.componentInstance.isMenuOpen()).toBeFalse();
        expect(TestBed.inject(Router).url).toBe('/about/history');
    });
    for (const path of [
        '/regulations',
        '/about/philosophy',
        '/about/history',
    ]) {
        it(`highlights the parent and current child at ${path}`, async () => {
            await TestBed.inject(Router).navigateByUrl(path);
            fixture.detectChanges();
            await fixture.whenStable();
            fixture.detectChanges();
            const group = fixture.nativeElement.querySelector(
                '.header__nav--desktop .header__about',
            );
            expect(
                group.classList.contains('header__about--active'),
            ).toBeTrue();
            expect(
                group
                    .querySelector(`a[href="${path}"]`)
                    .getAttribute('aria-current'),
            ).toBe('page');
        });
    }
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
