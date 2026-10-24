import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TeamsMapComponent } from './teams-map.component';

describe('Teams map explorer', () => {
    let fixture: ComponentFixture<TeamsMapComponent>;
    let component: TeamsMapComponent;
    const choices = (): HTMLButtonElement[] => [
        ...fixture.nativeElement.querySelectorAll('.teams-map__choice'),
    ];
    const markers = (): HTMLButtonElement[] => [
        ...fixture.nativeElement.querySelectorAll('.teams-map__marker'),
    ];
    const name = (): string =>
        fixture.nativeElement.querySelector('h3').textContent.trim();

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TeamsMapComponent],
            providers: [provideRouter([])],
        }).compileComponents();
        fixture = TestBed.createComponent(TeamsMapComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('keeps all existing teams and selects the first without fabricated statistics', () => {
        expect(markers().length).toBe(12);
        expect(choices().length).toBe(12);
        expect(name()).toBe('Арман');
        expect(choices()[0].getAttribute('aria-pressed')).toBe('true');
        expect(markers()[0].getAttribute('aria-pressed')).toBe('true');
        expect(
            fixture.nativeElement
                .querySelector('.teams-map__team-link')
                .getAttribute('href'),
        ).toBe('/team/2');
    });

    it('uses the new vector scheme instead of the old red raster', () => {
        expect(
            fixture.nativeElement
                .querySelector('.teams-map__image')
                .getAttribute('src'),
        ).toBe('/brand/elements/cheboksary-map.svg');
        expect(fixture.nativeElement.textContent).toContain(
            'не адреса домашних площадок',
        );
    });

    it('selects a team on map hover and synchronises the list and details', () => {
        markers()[1].dispatchEvent(new MouseEvent('mouseenter'));
        fixture.detectChanges();
        expect(name()).toBe('ЧЭТК');
        expect(choices()[1].getAttribute('aria-pressed')).toBe('true');
        expect(choices()[0].getAttribute('aria-pressed')).toBe('false');
        expect(
            fixture.nativeElement
                .querySelector('.teams-map__team-link')
                .getAttribute('href'),
        ).toBe('/team/12');
    });

    it('supports list focus and click without navigating away', () => {
        choices()[8].dispatchEvent(new FocusEvent('focus'));
        fixture.detectChanges();
        expect(name()).toBe('Дизель');
        choices()[3].click();
        fixture.detectChanges();
        expect(name()).toBe('Новые Лапсары');
        expect(markers()[3].getAttribute('aria-pressed')).toBe('true');
        expect(choices()[3].getAttribute('aria-controls')).toBe(
            fixture.nativeElement.querySelector('article').id,
        );
    });

    it('uses attributed shared archive images without claiming to show the selected team', () => {
        const before = fixture.nativeElement.querySelector('.teams-map__photo');
        component.selectTeam(2);
        fixture.detectChanges();
        const after = fixture.nativeElement.querySelector('.teams-map__photo');
        expect(after).not.toBe(before);
        expect(after.getAttribute('src')).toBe('/brand/photos/match-duel.jpg');
        expect(fixture.nativeElement.textContent).toContain(
            'IVANOV / GEOMETRIA',
        );
        expect(fixture.nativeElement.textContent).toContain(
            'не фотография выбранной команды',
        );
    });

    it('handles failed logos without assigning the failure to another team', () => {
        markers()[0].querySelector('img')!.dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(markers()[0].textContent?.trim()).toBe('А');
        expect(
            fixture.nativeElement.querySelector('.teams-map__selected-logo'),
        ).toBeNull();
        component.selectTeam(2);
        fixture.detectChanges();
        expect(
            fixture.nativeElement
                .querySelector('.teams-map__selected-logo')
                .getAttribute('src'),
        ).toBe(component.teams[1].logoUrl);
    });

    it('shows a branded fallback if an archive image fails', () => {
        fixture.nativeElement
            .querySelector('.teams-map__photo')
            .dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.teams-map__photo'),
        ).toBeNull();
        expect(
            fixture.nativeElement.querySelector('.teams-map__photo-fallback'),
        ).not.toBeNull();
        component.selectTeam(2);
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.teams-map__photo'),
        ).not.toBeNull();
    });

    it('ignores unknown teams and keeps original map coordinates', () => {
        component.selectTeam(999);
        fixture.detectChanges();
        expect(name()).toBe('Арман');
        expect(markers()[0].style.left).toBe('32%');
        expect(markers()[0].style.top).toBe('96%');
    });

    it('provides a return link from the mobile card to the team choices', () => {
        const link = fixture.nativeElement.querySelector('.teams-map__back');
        expect(link.getAttribute('href')).toBe('#teams-map-choices');
        expect(
            fixture.nativeElement.querySelector('#teams-map-choices'),
        ).not.toBeNull();
    });

    it('reveals the updated card after a mobile pointer selection with reduced-motion support', () => {
        spyOn(window, 'matchMedia').and.returnValue({
            matches: true,
        } as MediaQueryList);
        const panel = fixture.nativeElement.querySelector(
            '.teams-map__spotlight',
        );
        spyOn(panel, 'getBoundingClientRect').and.returnValue({
            top: -500,
            bottom: -100,
        } as DOMRect);
        const scroll = spyOn(panel, 'scrollIntoView');
        choices()[1].dispatchEvent(new MouseEvent('click', { detail: 1 }));
        fixture.detectChanges();
        expect(name()).toBe('ЧЭТК');
        expect(scroll).toHaveBeenCalledWith({
            block: 'start',
            behavior: 'instant',
        });
    });
});
