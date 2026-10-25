import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { TournamentChampion } from '../../entities/tournaments/model/tournament-champion.model';
import { SeasonChampionPageComponent } from './season-champion-page.component';

describe('Editorial season champion', () => {
    let fixture: ComponentFixture<SeasonChampionPageComponent>;
    let api: jasmine.SpyObj<TournamentsApi>;
    const page: TournamentChampion = {
        tournament: { id: 6, name: 'Кубок района' },
        season: { id: 2, name: 'Лето', year: 2026 },
        champion: {
            team: {
                id: 11,
                name: 'Искра',
                shortName: null,
                logoUrl: null,
                primaryColor: null,
                secondaryColor: null,
            },
            final: {
                matchId: 184,
                matchDatetime: '2026-07-23T18:00:00+03:00',
                homeScore: 2,
                awayScore: 2,
                penaltyHomeScore: 4,
                penaltyAwayScore: 3,
            },
            players: [
                {
                    id: 1,
                    name: 'Иван Петров',
                    photoUrl: null,
                    shirtNumber: 7,
                    position: 'forward',
                    appearances: 6,
                },
            ],
        },
    };
    beforeEach(async () => {
        api = jasmine.createSpyObj('TournamentsApi', [
            'getActiveTournament',
            'getChampion',
        ]);
        api.getActiveTournament.and.returnValue(of({ id: 6 } as any));
        api.getChampion.and.returnValue(of(page));
        await TestBed.configureTestingModule({
            imports: [SeasonChampionPageComponent],
            providers: [
                provideRouter([]),
                { provide: TournamentsApi, useValue: api },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(SeasonChampionPageComponent);
        fixture.detectChanges();
    });
    it('renders the actual champion and score rather than attributing an archive team photo', () => {
        expect(
            fixture.nativeElement
                .querySelector('.champion-team')
                .getAttribute('href'),
        ).toBe('/team/11');
        expect(
            fixture.nativeElement.querySelector('.champion-team').textContent,
        ).toContain('Искра');
        expect(
            fixture.nativeElement
                .querySelector('.final-result > strong')
                .textContent.replace(/\s/g, ''),
        ).toBe('2:2');
        expect(
            fixture.nativeElement.querySelector('.final-result small')
                .textContent,
        ).toContain('4:3');
        expect(
            fixture.nativeElement
                .querySelector('.champion-hero__photo img')
                .getAttribute('src'),
        ).toBe('brand/photos/league-trophies.jpg');
        expect(
            fixture.nativeElement.querySelector('figcaption').textContent,
        ).toContain('фотоархив');
    });
    it('keeps the approved player list and uses readable fallbacks for missing portraits', () => {
        expect(
            fixture.nativeElement.querySelector('.player-card').textContent,
        ).toContain('Иван Петров');
        expect(
            fixture.nativeElement
                .querySelector('.player-card__number')
                .textContent.trim(),
        ).toBe('7');
        expect(
            fixture.nativeElement
                .querySelector('.player-card__initials')
                .textContent.trim(),
        ).toBe('ИП');
    });
    it('does not show shootout results when there was no shootout', () => {
        fixture.componentInstance.data.set({
            ...page,
            champion: {
                ...page.champion!,
                final: {
                    ...page.champion!.final,
                    homeScore: 3,
                    awayScore: 1,
                    penaltyHomeScore: null,
                    penaltyAwayScore: null,
                },
            },
        });
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.final-result small'),
        ).toBeNull();
    });
    it('shows the awaiting state without a fabricated champion or roster', () => {
        fixture.componentInstance.data.set({ ...page, champion: null });
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.champion-awaiting'),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('.champion-team'),
        ).toBeNull();
        expect(fixture.nativeElement.querySelector('.players-grid')).toBeNull();
    });
    it('shows an actionable error on a failed request', () => {
        api.getChampion.and.returnValue(
            throwError(() => new Error('unavailable')),
        );
        fixture.componentInstance.loadChampion();
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('button').textContent,
        ).toContain('Повторить');
    });
});
