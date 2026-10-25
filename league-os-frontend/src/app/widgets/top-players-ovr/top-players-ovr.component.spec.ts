import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { PlayerCardsApi } from '../../entities/player-card/api/player-cards.api';
import {
    PlayerCard,
    TournamentPlayerCards,
} from '../../entities/player-card/model/player-card.types';
import { TopPlayersOvrComponent } from './top-players-ovr.component';

describe('Top five player spotlight', () => {
    let fixture: ComponentFixture<TopPlayersOvrComponent>;
    let api: jasmine.SpyObj<PlayerCardsApi>;
    let response: TournamentPlayerCards;
    const makePlayer = (index: number): PlayerCard => ({
        playerId: index + 1,
        name: `Игрок ${index + 1}`,
        photoUrl:
            index === 2
                ? null
                : `/brand/logos/mark_${index % 2 ? 'black' : 'white'}.svg`,
        position: 'FW',
        positionName: 'Нападающий',
        team: { id: index + 10, name: `Команда ${index + 1}`, logoUrl: null },
        shirtNumber: index + 7,
        preferredFoot: 'right',
        preferredFootName: 'Правая',
        hasLimitedData: index === 4,
        ratings: {
            ovr: 95 - index,
            att: 80,
            cre: 70,
            form: 82,
            exp: 76,
            disc: 90,
            imp: 81,
        },
        stats: {
            matches: 6 + index,
            goals: 10 - index,
            assists: index + 2,
            goalContributions: 12,
            goalsPerMatch: 1,
            assistsPerMatch: 0.5,
            goalContributionsPerMatch: 1.5,
            recentGoalContributions: 4,
            yellowCards: 0,
            secondYellowCards: 0,
            redCards: 0,
            suspensions: 0,
        },
    });
    const rows = (): HTMLButtonElement[] => [
        ...fixture.nativeElement.querySelectorAll('.top-player'),
    ];
    const selectedName = () =>
        fixture.nativeElement
            .querySelector('.player-spotlight h3')
            ?.textContent.trim();
    beforeEach(async () => {
        response = {
            tournamentId: 6,
            tournamentName: 'Дворовая лига',
            ratingVersion: 1,
            players: Array.from({ length: 7 }, (_, i) => makePlayer(i)),
        };
        api = jasmine.createSpyObj('PlayerCardsApi', ['getTournamentCards']);
        api.getTournamentCards.and.returnValue(of(response));
        await TestBed.configureTestingModule({
            imports: [TopPlayersOvrComponent],
            providers: [
                provideRouter([]),
                { provide: PlayerCardsApi, useValue: api },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(TopPlayersOvrComponent);
        fixture.componentRef.setInput('tournamentId', 6);
        fixture.detectChanges();
    });
    it('keeps only five players in server order and selects the leader initially', () => {
        expect(rows().length).toBe(5);
        expect(
            fixture.componentInstance.players().map((p) => p.playerId),
        ).toEqual([1, 2, 3, 4, 5]);
        expect(selectedName()).toBe('Игрок 1');
        expect(rows()[0].getAttribute('aria-pressed')).toBe('true');
        expect(fixture.nativeElement.textContent).toContain('Дворовая лига');
    });
    it('switches the photo and statistics on hover without reusing the previous portrait', () => {
        const firstPhoto = fixture.nativeElement.querySelector(
            '.player-spotlight__photo',
        );
        rows()[1].dispatchEvent(new MouseEvent('mouseenter'));
        fixture.detectChanges();
        const photo = fixture.nativeElement.querySelector(
            '.player-spotlight__photo',
        );
        expect(selectedName()).toBe('Игрок 2');
        expect(photo.getAttribute('src')).toBe('/brand/logos/mark_black.svg');
        expect(photo).not.toBe(firstPhoto);
        expect(
            [
                ...fixture.nativeElement.querySelectorAll(
                    '.player-spotlight__stats dd',
                ),
            ].map((el: any) => el.textContent.trim()),
        ).toEqual(['7', '9', '3']);
        expect(rows()[1].getAttribute('aria-pressed')).toBe('true');
        expect(rows()[0].getAttribute('aria-pressed')).toBe('false');
    });
    it('supports keyboard focus and touch clicks', () => {
        rows()[3].dispatchEvent(new FocusEvent('focus'));
        fixture.detectChanges();
        expect(selectedName()).toBe('Игрок 4');
        rows()[4].click();
        fixture.detectChanges();
        expect(selectedName()).toBe('Игрок 5');
        expect(
            fixture.nativeElement.querySelector('.player-spotlight__limited'),
        ).not.toBeNull();
        expect(rows()[4].getAttribute('aria-controls')).toBe(
            fixture.nativeElement.querySelector('.player-spotlight').id,
        );
    });
    it('uses a labelled jersey fallback for a missing photo and keeps the player identity', () => {
        rows()[2].click();
        fixture.detectChanges();
        expect(selectedName()).toBe('Игрок 3');
        expect(
            fixture.nativeElement.querySelector('.player-spotlight__photo'),
        ).toBeNull();
        expect(
            fixture.nativeElement.querySelector(
                '.player-spotlight__missing-photo',
            ).textContent,
        ).toContain('Фотография пока не загружена');
        expect(
            fixture.nativeElement
                .querySelector('.player-spotlight__shirt')
                .textContent.trim(),
        ).toBe('9');
    });
    it('replaces a broken photo without losing metrics or breaking another player photo', () => {
        fixture.nativeElement
            .querySelector('.player-spotlight__photo')
            .dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.player-spotlight__fallback'),
        ).not.toBeNull();
        rows()[1].click();
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.player-spotlight__photo'),
        ).not.toBeNull();
        expect(selectedName()).toBe('Игрок 2');
    });
    it('shows zero values and uses initials when a shirt number is missing', () => {
        fixture.componentInstance.players.set([
            {
                ...makePlayer(2),
                shirtNumber: null,
                stats: {
                    ...makePlayer(2).stats,
                    matches: 0,
                    goals: 0,
                    assists: 0,
                },
            },
        ]);
        fixture.detectChanges();
        expect(
            [
                ...fixture.nativeElement.querySelectorAll(
                    '.player-spotlight__stats dd',
                ),
            ].map((el: any) => el.textContent.trim()),
        ).toEqual(['0', '0', '0']);
        expect(
            fixture.nativeElement
                .querySelector('.player-spotlight__shirt')
                .textContent.trim(),
        ).toBe('И3');
    });
    it('shows an empty state when no cards are returned', () => {
        api.getTournamentCards.and.returnValue(
            of({ ...response, players: [] }),
        );
        fixture.componentInstance.reload();
        fixture.detectChanges();
        expect(rows().length).toBe(0);
        expect(fixture.nativeElement.textContent).toContain(
            'недостаточно данных',
        );
    });
    it('offers a working retry on request failure', () => {
        api.getTournamentCards.and.returnValue(
            throwError(() => new Error('network')),
        );
        fixture.componentInstance.reload();
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).not.toBeNull();
        api.getTournamentCards.and.returnValue(of(response));
        fixture.nativeElement
            .querySelector('.top-players__state button')
            .click();
        fixture.detectChanges();
        expect(selectedName()).toBe('Игрок 1');
        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).toBeNull();
    });
    it('clears stale selection and failed images when the tournament changes', () => {
        fixture.componentInstance.markPhotoAsFailed(1);
        fixture.componentInstance.selectPlayer(4);
        const pending = new Subject<TournamentPlayerCards>();
        api.getTournamentCards.and.returnValue(pending);
        fixture.componentRef.setInput('tournamentId', 7);
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('[role="status"]'),
        ).not.toBeNull();
        expect(fixture.componentInstance.players().length).toBe(0);
        expect(fixture.componentInstance.failedPhotoIds().size).toBe(0);
        pending.next({
            ...response,
            tournamentId: 7,
            players: [makePlayer(5)],
        });
        fixture.detectChanges();
        expect(selectedName()).toBe('Игрок 6');
        expect(api.getTournamentCards).toHaveBeenCalledWith(7);
    });
    it('cancels pending requests on tournament changes and destruction', () => {
        let cancelled = 0;
        api.getTournamentCards.and.returnValue(
            new Observable(() => () => {
                cancelled++;
            }),
        );
        fixture.componentRef.setInput('tournamentId', 7);
        fixture.detectChanges();
        fixture.componentRef.setInput('tournamentId', 8);
        fixture.detectChanges();
        expect(cancelled).toBe(1);
        fixture.destroy();
        expect(cancelled).toBe(2);
    });
    it('keeps existing team and full-rating links', () => {
        expect(
            fixture.nativeElement.querySelector('a[href="/players"]'),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('a[href="/team/10"]'),
        ).not.toBeNull();
    });
    it('reveals the offscreen preview after a mobile pointer selection without animated scrolling for reduced motion', () => {
        spyOn(window, 'matchMedia').and.returnValue({
            matches: true,
        } as MediaQueryList);
        const panel: HTMLElement =
            fixture.nativeElement.querySelector('.player-spotlight');
        spyOn(panel, 'getBoundingClientRect').and.returnValue({
            top: -200,
        } as DOMRect);
        const scroll = spyOn(panel, 'scrollIntoView');
        rows()[1].dispatchEvent(new MouseEvent('click', { detail: 1 }));
        fixture.detectChanges();
        expect(selectedName()).toBe('Игрок 2');
        expect(scroll).toHaveBeenCalledWith({
            block: 'start',
            behavior: 'instant',
        });
        expect(fixture.nativeElement.querySelector('.player-spotlight')).toBe(
            panel,
        );
    });
});
