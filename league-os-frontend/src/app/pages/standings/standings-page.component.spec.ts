import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { MatchApi } from '../../entities/match/api/match.api';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { PublicTournamentView } from '../../entities/standings/model/public-tournament-view.model';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { FeatureFlagsApi } from '../../shared/api/feature-flags.api';
import { StandingsPageComponent } from './standings-page.component';

describe('StandingsPageComponent', () => {
    let fixture: ComponentFixture<StandingsPageComponent>;

    function reloadView(update: (view: PublicTournamentView) => void): void {
        const view = structuredClone(fixture.componentInstance.view()!);
        update(view);
        spyOn(
            TestBed.inject(StandingsApi),
            'getPublicTournamentView',
        ).and.returnValue(of(view));
        fixture.componentInstance.loadStandings();
        fixture.detectChanges();
    }

    const heading = (): string =>
        fixture.nativeElement.querySelector('h1').textContent.trim();

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
                                    homeTeam: { id: 5, name: 'Арман' },
                                    awayTeam: { id: 6, name: 'Команда 6' },
                                    score: { home: 2, away: 0 },
                                },
                                {
                                    id: 2,
                                    status: 'finished',
                                    matchDateTime: '2026-08-02T18:00:00',
                                    homeTeam: { id: 5, name: 'Арман' },
                                    awayTeam: { id: 7, name: 'Команда 7' },
                                    score: { home: 1, away: 1 },
                                },
                                {
                                    id: 3,
                                    status: 'finished',
                                    matchDateTime: '2026-08-03T18:00:00',
                                    homeTeam: { id: 5, name: 'Арман' },
                                    awayTeam: { id: 8, name: 'Команда 8' },
                                    score: { home: 0, away: 1 },
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
        expect(heading()).toBe('Групповой этап');
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

        const formResults: HTMLElement[] = Array.from(
            fixture.nativeElement.querySelectorAll(
                'tbody .form-series .form-series__result',
            ),
        );
        expect(formResults[0].classList).toContain('form-series__result--win');
        expect(formResults[0].title).toBe('Арман — Команда 6 · 2:0 · Победа');
        expect(formResults[1].classList).toContain('form-series__result--draw');
        expect(formResults[2].classList).toContain('form-series__result--loss');
    });

    it('switches to the play-off stage', () => {
        const buttons: HTMLButtonElement[] = Array.from(
            fixture.nativeElement.querySelectorAll('.stage-tabs button'),
        );
        buttons
            .find((button) => button.textContent?.includes('Плей-офф'))
            ?.click();
        fixture.detectChanges();

        expect(heading()).toBe('Плей-офф');
        expect(fixture.nativeElement.textContent).toContain(
            'Сетка появится после завершения группового этапа',
        );
    });

    it('opens the API-selected play-offs even when both stages are completed', () => {
        reloadView((view) => {
            view.activeStageId = 3;
            view.stages.forEach((stage) => (stage.status = 'completed'));
            view.stages[1].bracket = {
                confirmed: true,
                matches: [
                    {
                        id: 91,
                        position: 'FINAL',
                        roundType: 'final',
                        roundNumber: 1,
                        status: 'finished',
                        homeTeam: { id: 5, name: 'Арман' },
                        awayTeam: { id: 6, name: 'Соперник' },
                        homeSourceLabel: '',
                        awaySourceLabel: '',
                        regularTime: { home: 2, away: 1 },
                        winnerTeamId: 5,
                    },
                ],
            };
        });
        expect(heading()).toBe('Плей-офф');
        expect(
            fixture.nativeElement.querySelector('app-knockout-bracket'),
        ).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.full-table')).toBeNull();
        expect(
            fixture.nativeElement
                .querySelector('.stage-tabs__button--active')
                .textContent.trim(),
        ).toBe('Плей-офф');
    });

    it('does not treat a preliminary play-off structure as the current stage', () => {
        reloadView((view) => {
            view.stages[1].empty = false;
            view.stages[1].bracket.matches = [
                {
                    position: 'FINAL',
                    roundType: 'final',
                    roundNumber: 1,
                    status: 'pending',
                    homeSourceLabel: 'Победитель SF-1',
                    awaySourceLabel: 'Победитель SF-2',
                },
            ];
        });
        expect(heading()).toBe('Групповой этап');
        expect(
            fixture.nativeElement.querySelector('.full-table'),
        ).not.toBeNull();
    });

    [null, 999].forEach((activeStageId) => {
        it(`uses the active stage status when the stage id is ${activeStageId}`, () => {
            reloadView((view) => {
                view.activeStageId = activeStageId;
                view.stages[0].status = 'completed';
                view.stages[1].status = 'active';
            });
            expect(heading()).toBe('Плей-офф');
        });
    });

    it('uses the last completed stage when there is no active stage id', () => {
        reloadView((view) => {
            view.activeStageId = null;
            view.stages.forEach((stage) => (stage.status = 'completed'));
            view.stages.reverse();
        });
        expect(heading()).toBe('Плей-офф');
    });

    it('keeps manual access to the completed group stage without changing the tournament stage', () => {
        reloadView((view) => {
            view.activeStageId = 3;
        });
        fixture.nativeElement.querySelectorAll('.stage-tabs button')[0].click();
        fixture.detectChanges();
        expect(heading()).toBe('Групповой этап');
        expect(fixture.componentInstance.view()?.activeStageId).toBe(3);
        expect(
            fixture.nativeElement.querySelector('.full-table'),
        ).not.toBeNull();
    });

    it('uses the stage name instead of calling every non-knockout stage a group stage', () => {
        reloadView((view) => {
            view.stages[0].type = 'round_robin';
            view.stages[0].name = 'Регулярный чемпионат';
        });
        expect(heading()).toBe('Регулярный чемпионат');
        expect(
            fixture.nativeElement
                .querySelector('.section-heading span')
                .textContent.trim(),
        ).toBe('Регулярный чемпионат');
    });

    it('uses a neutral title when stages have not been published', () => {
        reloadView((view) => {
            view.stages = [];
            view.activeStageId = null;
        });
        expect(heading()).toBe('Статистика');
        expect(fixture.nativeElement.textContent).toContain(
            'Этапы турнира пока не опубликованы',
        );
    });
});
