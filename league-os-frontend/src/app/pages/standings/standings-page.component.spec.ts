import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { MatchApi } from '../../entities/match/api/match.api';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { FeatureFlagsApi } from '../../shared/api/feature-flags.api';
import { StandingsPageComponent } from './standings-page.component';

describe('StandingsPageComponent', () => {
    let fixture: ComponentFixture<StandingsPageComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [StandingsPageComponent],
            providers: [
                {
                    provide: TournamentsApi,
                    useValue: {
                        getActiveTournament: () =>
                            of({ id: 10, name: 'Дворовая лига' }),
                    },
                },
                {
                    provide: FeatureFlagsApi,
                    useValue: {
                        get: () => of({ multiStagePublicView: true }),
                    },
                },
                {
                    provide: StandingsApi,
                    useValue: {
                        getPublicTournamentView: () =>
                            of({
                                tournament: { id: 10, name: 'Дворовая лига' },
                                activeStageId: 1,
                                stages: [
                                    {
                                        id: 1,
                                        key: 'group',
                                        name: 'Групповой этап',
                                        type: 'group_stage',
                                        order: 1,
                                        status: 'active',
                                        groups: [
                                            {
                                                id: 2,
                                                key: 'a',
                                                name: 'Группа А',
                                                order: 1,
                                                standings: [
                                                    {
                                                        position: 1,
                                                        team: {
                                                            id: 5,
                                                            name: 'Арман',
                                                        },
                                                        played: 3,
                                                        wins: 2,
                                                        draws: 1,
                                                        losses: 0,
                                                        goalsFor: 8,
                                                        goalsAgainst: 3,
                                                        goalDifference: 5,
                                                        points: 7,
                                                        qualificationStatus:
                                                            'qualified',
                                                    },
                                                ],
                                            },
                                        ],
                                        standings: [],
                                        crossGroupRankings: [],
                                        bracket: {
                                            confirmed: false,
                                            matches: [],
                                        },
                                        empty: false,
                                    },
                                    {
                                        id: 3,
                                        key: 'playoff',
                                        name: 'Плей-офф',
                                        type: 'knockout',
                                        order: 2,
                                        status: 'pending',
                                        groups: [],
                                        standings: [],
                                        crossGroupRankings: [],
                                        bracket: {
                                            confirmed: false,
                                            matches: [],
                                        },
                                        empty: true,
                                    },
                                ],
                            }),
                    },
                },
                {
                    provide: MatchApi,
                    useValue: {
                        getByTournament: () =>
                            of([
                                {
                                    id: 1,
                                    status: 'finished',
                                    matchDateTime: '2026-08-01T18:00:00',
                                    homeTeam: { id: 5 },
                                    awayTeam: { id: 6 },
                                    score: { home: 2, away: 0 },
                                },
                            ]),
                    },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(StandingsPageComponent);
        fixture.detectChanges();
    });

    it('renders the full group table and recent form', () => {
        expect(fixture.nativeElement.textContent).toContain('Таблица');
        expect(
            fixture.nativeElement.querySelector('th[title="Забитые мячи"]'),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('th[title="Пропущенные мячи"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Арман');
        expect(fixture.nativeElement.textContent).toContain(
            'В рейтинг попадают команды, занявшие вторые места',
        );
        expect(
            fixture.nativeElement.querySelectorAll('.form-series__result--win')
                .length,
        ).toBeGreaterThan(0);
    });

    it('switches to the play-off stage', () => {
        const buttons: HTMLButtonElement[] = Array.from(
            fixture.nativeElement.querySelectorAll('.stage-tabs button'),
        );
        buttons
            .find((button) => button.textContent?.includes('Плей-офф'))
            ?.click();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain(
            'Сетка появится после завершения группового этапа',
        );
    });
});
