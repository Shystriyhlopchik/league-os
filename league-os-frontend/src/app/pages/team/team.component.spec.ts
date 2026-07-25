import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { TeamsApi } from '../../entities/team/api/teams.api';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { TeamComponent } from './team.component';

describe('TeamComponent', () => {
    let fixture: ComponentFixture<TeamComponent>;
    let teamsApi: jasmine.SpyObj<TeamsApi>;
    let tournamentsApi: jasmine.SpyObj<TournamentsApi>;

    beforeEach(async () => {
        teamsApi = jasmine.createSpyObj<TeamsApi>('TeamsApi', [
            'getTournamentTeams',
        ]);
        tournamentsApi = jasmine.createSpyObj<TournamentsApi>(
            'TournamentsApi',
            ['getActiveTournament'],
        );

        await TestBed.configureTestingModule({
            imports: [TeamComponent],
            providers: [
                provideRouter([]),
                { provide: TeamsApi, useValue: teamsApi },
                { provide: TournamentsApi, useValue: tournamentsApi },
            ],
        }).compileComponents();
    });

    it('loads and renders teams of the active tournament', () => {
        tournamentsApi.getActiveTournament.and.returnValue(
            of({ id: 7, name: 'Дворовая лига' } as never),
        );
        teamsApi.getTournamentTeams.and.returnValue(
            of([
                {
                    id: 1,
                    name: 'ЖБК-9',
                    slug: 'zhbk-9',
                    logoUrl: '/uploads/teams/zhbk-9.png',
                    isActive: true,
                },
                {
                    id: 2,
                    name: 'Арман',
                    slug: 'arman',
                    logoUrl: null,
                    isActive: true,
                },
            ]),
        );

        fixture = TestBed.createComponent(TeamComponent);
        fixture.detectChanges();

        expect(teamsApi.getTournamentTeams).toHaveBeenCalledWith(7);
        expect(
            fixture.nativeElement.querySelector('.teams-page__title')
                .textContent,
        ).toContain('Дворовая лига');
        expect(
            fixture.nativeElement.querySelectorAll('.team-card').length,
        ).toBe(2);
    });

    it('shows a retry action when loading fails', () => {
        tournamentsApi.getActiveTournament.and.returnValue(
            of({ id: 7, name: 'Дворовая лига' } as never),
        );
        teamsApi.getTournamentTeams.and.returnValue(
            throwError(() => new Error('Network error')),
        );

        fixture = TestBed.createComponent(TeamComponent);
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.querySelector('button').textContent).toContain(
            'Повторить',
        );
    });
});
