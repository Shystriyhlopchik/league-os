import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { MatchApi } from '../../entities/match/api/match.api';
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
            fixture.nativeElement.querySelectorAll('app-match-card').length,
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
        fixture.nativeElement.querySelector('.match-card').click();

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
            fixture.nativeElement.querySelectorAll('app-match-card').length,
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
});

function match(
    id: number,
    matchDateTime: string,
    homeTeamId = 1,
    awayTeamId = 2,
) {
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
    } as never;
}
