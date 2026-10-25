import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { MatchApi } from '../../entities/match/api/match.api';
import { Match } from '../../entities/match/model/match.types';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { MatchesPageComponent } from './matches-page.component';

describe('MatchesPageComponent', () => {
    let fixture: ComponentFixture<MatchesPageComponent>;
    let matchApi: jasmine.SpyObj<MatchApi>;
    let tournamentsApi: jasmine.SpyObj<TournamentsApi>;
    let router: jasmine.SpyObj<Router>;

    beforeEach(async () => {
        matchApi = jasmine.createSpyObj<MatchApi>('MatchApi', [
            'getByTournament',
        ]);
        tournamentsApi = jasmine.createSpyObj<TournamentsApi>(
            'TournamentsApi',
            ['getActiveTournament'],
        );
        router = jasmine.createSpyObj<Router>('Router', ['navigate']);
        router.navigate.and.resolveTo(true);

        await TestBed.configureTestingModule({
            imports: [MatchesPageComponent],
            providers: [
                { provide: MatchApi, useValue: matchApi },
                { provide: TournamentsApi, useValue: tournamentsApi },
                { provide: Router, useValue: router },
            ],
        }).compileComponents();
    });

    it('loads all matches and groups them by date', () => {
        tournamentsApi.getActiveTournament.and.returnValue(
            of({ id: 7, name: 'Дворовая лига' } as never),
        );
        matchApi.getByTournament.and.returnValue(
            of([
                match(31, '2026-07-21T18:30:00'),
                match(32, '2026-07-21T19:10:00'),
                match(33, '2026-07-23T18:30:00'),
            ]),
        );

        fixture = TestBed.createComponent(MatchesPageComponent);
        fixture.detectChanges();

        expect(matchApi.getByTournament).toHaveBeenCalledWith(7);
        expect(
            fixture.nativeElement.querySelectorAll('.matches-date').length,
        ).toBe(2);
        expect(
            fixture.nativeElement.querySelectorAll('app-match-schedule-row')
                .length,
        ).toBe(3);
    });

    it('opens the public match protocol from a card', () => {
        tournamentsApi.getActiveTournament.and.returnValue(
            of({ id: 7, name: 'Дворовая лига' } as never),
        );
        matchApi.getByTournament.and.returnValue(
            of([match(31, '2026-07-21T18:30:00')]),
        );

        fixture = TestBed.createComponent(MatchesPageComponent);
        fixture.detectChanges();
        fixture.nativeElement.querySelector('.match-schedule').click();

        expect(router.navigate).toHaveBeenCalledWith([
            '/matches',
            31,
            'protocol',
        ]);
    });

    it('filters matches by the selected team', () => {
        tournamentsApi.getActiveTournament.and.returnValue(
            of({ id: 7, name: 'Дворовая лига' } as never),
        );
        matchApi.getByTournament.and.returnValue(
            of([
                match(31, '2026-07-21T18:30:00'),
                match(32, '2026-07-23T18:30:00', 3, 4),
            ]),
        );

        fixture = TestBed.createComponent(MatchesPageComponent);
        fixture.detectChanges();

        expect(fixture.componentInstance.teamOptions().length).toBe(5);
        fixture.componentInstance.selectedTeamId.set(1);
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelectorAll('app-match-schedule-row')
                .length,
        ).toBe(1);
        expect(fixture.nativeElement.textContent).toContain('Матчей: 1');
    });

    it('shows an error state when matches cannot be loaded', () => {
        tournamentsApi.getActiveTournament.and.returnValue(
            of({ id: 7, name: 'Дворовая лига' } as never),
        );
        matchApi.getByTournament.and.returnValue(
            throwError(() => new Error('Network error')),
        );

        fixture = TestBed.createComponent(MatchesPageComponent);
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).not.toBeNull();
    });

    function renderMatches(records: Match[]): void {
        tournamentsApi.getActiveTournament.and.returnValue(
            of({ id: 7, name: 'Дворовая лига' } as never),
        );
        matchApi.getByTournament.and.returnValue(of(records));
        fixture = TestBed.createComponent(MatchesPageComponent);
        fixture.detectChanges();
    }

    it('uses the Figma-inspired title, local accent and attributed archive photo', () => {
        renderMatches([match(31, '2026-07-21T18:30:00')]);
        expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
            'Расписание',
        );
        expect(
            fixture.nativeElement
                .querySelector('.matches-hero__accent')
                .getAttribute('src'),
        ).toBe('/brand/schedule/heading-accent.svg');
        expect(
            fixture.nativeElement
                .querySelector('.matches-hero__photo')
                .getAttribute('src'),
        ).toBe('/brand/photos/match-duel.jpg');
        expect(fixture.nativeElement.textContent).toContain(
            'Фотоархив лиги · IVANOV / GEOMETRIA',
        );
    });

    it('sorts all dates and kick-off times chronologically regardless of API order', () => {
        renderMatches([
            match(33, '2026-07-23T18:30:00'),
            match(32, '2026-07-21T19:10:00'),
            match(31, '2026-07-21T18:30:00'),
        ]);
        expect(
            fixture.componentInstance
                .dateGroups()
                .map((group) => group.matches.map((item) => item.id)),
        ).toEqual([[31, 32], [33]]);
    });

    it('combines the team and status filters', () => {
        const scheduled = match(31, '2026-07-21T18:30:00');
        const finished = {
            ...match(32, '2026-07-22T18:30:00', 1, 3),
            status: 'finished' as const,
        };
        const other = {
            ...match(33, '2026-07-23T18:30:00', 3, 4),
            status: 'finished' as const,
        };
        renderMatches([scheduled, finished, other]);
        fixture.componentInstance.selectedTeamId.set(1);
        const button = fixture.nativeElement.querySelectorAll(
            '.matches-page__status-filters button',
        )[2];
        button.click();
        fixture.detectChanges();
        expect(
            fixture.componentInstance.filteredMatches().map((item) => item.id),
        ).toEqual([32]);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(fixture.nativeElement.textContent).toContain('Матчей: 1');
    });

    it('excludes live and cancelled matches from the upcoming filter', () => {
        renderMatches([
            match(31, '2026-07-21T18:30:00'),
            { ...match(32, '2026-07-22T18:30:00'), status: 'live' },
            { ...match(33, '2026-07-23T18:30:00'), status: 'cancelled' },
        ]);
        fixture.componentInstance.selectedStatus.set('upcoming');
        fixture.detectChanges();
        expect(
            fixture.componentInstance.filteredMatches().map((item) => item.id),
        ).toEqual([31]);
    });

    it('lets users reset an empty combination of filters', () => {
        renderMatches([
            { ...match(31, '2026-07-21T18:30:00'), status: 'finished' },
        ]);
        fixture.componentInstance.selectedTeamId.set(1);
        fixture.componentInstance.selectedStatus.set('upcoming');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
            'По выбранным фильтрам матчей нет',
        );
        fixture.nativeElement
            .querySelector('.matches-page__state button')
            .click();
        fixture.detectChanges();
        expect(fixture.componentInstance.selectedStatus()).toBe('all');
        expect(fixture.componentInstance.selectedTeamId()).toBe(0);
        expect(
            fixture.nativeElement.querySelectorAll('app-match-schedule-row')
                .length,
        ).toBe(1);
    });

    it('preserves the empty calendar message instead of inventing matches', () => {
        renderMatches([]);
        expect(fixture.nativeElement.textContent).toContain(
            'Календарь турнира пока не опубликован',
        );
        expect(
            fixture.nativeElement.querySelector('.matches-page__toolbar'),
        ).toBeNull();
    });

    it('groups timezone-bearing timestamps by the same local date displayed by DatePipe', () => {
        const timestamp = '2026-07-21T23:30:00-05:00';
        renderMatches([match(31, timestamp)]);
        const local = new Date(timestamp);
        const expected = [
            local.getFullYear(),
            String(local.getMonth() + 1).padStart(2, '0'),
            String(local.getDate()).padStart(2, '0'),
        ].join('-');
        expect(fixture.componentInstance.dateGroups()[0].key).toBe(expected);
    });

    it('retains the hero text when the archive photograph fails', () => {
        renderMatches([]);
        fixture.nativeElement
            .querySelector('.matches-hero__photo')
            .dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.matches-hero__photo'),
        ).toBeNull();
        expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
            'Расписание',
        );
    });

    it('retries after a request error', () => {
        tournamentsApi.getActiveTournament.and.returnValue(
            of({ id: 7, name: 'Дворовая лига' } as never),
        );
        matchApi.getByTournament.and.returnValue(
            throwError(() => new Error('Network error')),
        );
        fixture = TestBed.createComponent(MatchesPageComponent);
        fixture.detectChanges();
        matchApi.getByTournament.and.returnValue(
            of([match(31, '2026-07-21T18:30:00')]),
        );
        fixture.nativeElement.querySelector('[role="alert"] button').click();
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelectorAll('app-match-schedule-row')
                .length,
        ).toBe(1);
    });
});

function match(
    id: number,
    matchDateTime: string,
    homeTeamId = 1,
    awayTeamId = 2,
): Match {
    return {
        id,
        tournamentId: 7,
        round: 'Тур 1',
        status: 'scheduled',
        matchDateTime,
        homeTeam: {
            id: homeTeamId,
            name: `Команда ${homeTeamId}`,
            shortName: `Команда ${homeTeamId}`,
            logoUrl: null,
        },
        awayTeam: {
            id: awayTeamId,
            name: `Команда ${awayTeamId}`,
            shortName: `Команда ${awayTeamId}`,
            logoUrl: null,
        },
        score: { home: 0, away: 0 },
        venue: { id: 1, name: 'Поле «СОШ №53»' },
        tournament: {
            id: 7,
            name: 'Дворовая лига',
            logoUrl: '/uploads/tournaments/yard-league.png',
            season: { id: 1, name: 'Сезон 2026', year: 2026 },
            competition: {
                id: 1,
                name: 'Дворовая лига',
                slug: 'dvorovaya-liga',
            },
            type: 'league',
            format: 'mixed',
            status: 'planned',
            colorPrimary: '#27AE60',
            slug: 'dvorovaya-liga-2026',
        },
    } as unknown as Match;
}
