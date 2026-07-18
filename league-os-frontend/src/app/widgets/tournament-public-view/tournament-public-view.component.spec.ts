import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { PublicTournamentView } from '../../entities/standings/model/public-tournament-view.model';
import { StandingRow } from '../../entities/standings/model/standings-row.model';
import { SessionStore } from '../../entities/user/model/session.store';
import { FeatureFlagsApi } from '../../shared/api/feature-flags.api';
import { TournamentPublicViewComponent } from './tournament-public-view.component';

describe('TournamentPublicViewComponent', () => {
    let fixture: ComponentFixture<TournamentPublicViewComponent>;
    let api: jasmine.SpyObj<StandingsApi>;

    beforeEach(async () => {
        api = jasmine.createSpyObj<StandingsApi>('StandingsApi', [
            'getPublicTournamentView',
            'getActiveSuspensions',
        ]);
        await TestBed.configureTestingModule({
            imports: [TournamentPublicViewComponent],
            providers: [
                { provide: StandingsApi, useValue: api },
                {
                    provide: SessionStore,
                    useValue: { hasAnyRole: () => false },
                },
                {
                    provide: FeatureFlagsApi,
                    useValue: {
                        get: () =>
                            of({
                                tournamentBuilder: true,
                                multiStagePublicView: true,
                            }),
                    },
                },
            ],
        }).compileComponents();
    });

    it('shows loading and switches between stages returned by backend', () => {
        const response = new Subject<PublicTournamentView>();
        api.getPublicTournamentView.and.returnValue(response);
        fixture = createFixture();
        expect(fixture.nativeElement.textContent).toContain('Загружаем турнир');

        response.next(view());
        response.complete();
        fixture.detectChanges();
        const buttons = fixture.nativeElement.querySelectorAll(
            '.stage-tabs button',
        ) as NodeListOf<HTMLButtonElement>;
        buttons[1].click();
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Плей-офф');
        expect(fixture.nativeElement.textContent).toContain(
            'Участники сетки ещё не определены',
        );
    });

    it('shows backend errors with a retry action', () => {
        api.getPublicTournamentView.and.returnValue(
            throwError(() => new Error('network')),
        );
        fixture = createFixture();
        expect(fixture.nativeElement.textContent).toContain(
            'Не удалось загрузить данные турнира',
        );
        expect(
            fixture.nativeElement.querySelector('.state--error button'),
        ).not.toBeNull();
    });

    it('shows an empty stage state', () => {
        const empty = view();
        empty.stages = [{ ...empty.stages[0], empty: true, groups: [] }];
        empty.activeStageId = 10;
        api.getPublicTournamentView.and.returnValue(of(empty));
        fixture = createFixture();
        expect(fixture.nativeElement.textContent).toContain(
            'участники и матчи пока не опубликованы',
        );
    });

    it('renders one standings panel and switches groups with a select', () => {
        const groupedView = view();
        groupedView.stages[0].groups = [
            {
                id: 101,
                key: 'A',
                name: 'Группа A',
                order: 1,
                standings: [standing(1, 'Команда Альфа')],
            },
            {
                id: 102,
                key: 'B',
                name: 'Группа B',
                order: 2,
                standings: [standing(2, 'Команда Бета')],
            },
            {
                id: 103,
                key: 'C',
                name: 'Группа C',
                order: 3,
                standings: [standing(3, 'Команда Гамма')],
            },
        ];
        api.getPublicTournamentView.and.returnValue(of(groupedView));

        fixture = createFixture();

        expect(
            fixture.nativeElement.querySelectorAll('.panel--standings').length,
        ).toBe(1);
        expect(fixture.nativeElement.textContent).toContain('Команда Альфа');
        expect(fixture.nativeElement.textContent).not.toContain('Команда Бета');

        const select = fixture.nativeElement.querySelector(
            '.group-switcher select',
        ) as HTMLSelectElement;
        expect(select.options.length).toBe(3);
        select.value = '102';
        select.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Команда Бета');
        expect(fixture.nativeElement.textContent).not.toContain(
            'Команда Альфа',
        );
    });

    it('uses the external group in compact mode without stage or group controls', () => {
        const groupedView = view();
        groupedView.stages[0].groups = [
            {
                id: 101,
                key: 'A',
                name: 'Группа A',
                order: 1,
                standings: [standing(1, 'Команда Альфа')],
            },
            {
                id: 102,
                key: 'B',
                name: 'Группа B',
                order: 2,
                standings: [standing(2, 'Команда Бета')],
            },
        ];
        api.getPublicTournamentView.and.returnValue(of(groupedView));

        fixture = createFixture({ compact: true, groupId: 102 });

        expect(fixture.nativeElement.querySelector('.stage-tabs')).toBeNull();
        expect(
            fixture.nativeElement.querySelector('.group-switcher'),
        ).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Команда Бета');
        expect(fixture.nativeElement.textContent).not.toContain(
            'Команда Альфа',
        );
    });

    it('shows the preliminary bracket structure for an unconfirmed playoff', () => {
        const tournamentView = view();
        tournamentView.stages[1] = {
            ...tournamentView.stages[1],
            empty: true,
            bracket: {
                confirmed: false,
                matches: [
                    pendingMatch(
                        'SF-1',
                        'semi_final',
                        'Лучшая вторая команда',
                        'Победитель другой группы',
                    ),
                    pendingMatch(
                        'SF-2',
                        'semi_final',
                        'Победитель группы',
                        'Победитель группы',
                    ),
                    pendingMatch(
                        'THIRD_PLACE',
                        'third_place',
                        'Проигравший SF-1',
                        'Проигравший SF-2',
                    ),
                    pendingMatch(
                        'FINAL',
                        'final',
                        'Победитель SF-1',
                        'Победитель SF-2',
                    ),
                ],
            },
        };
        api.getPublicTournamentView.and.returnValue(of(tournamentView));
        fixture = createFixture();

        const buttons = fixture.nativeElement.querySelectorAll(
            '.stage-tabs button',
        ) as NodeListOf<HTMLButtonElement>;
        buttons[1].click();
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelectorAll('.match').length).toBe(4);
        expect(fixture.nativeElement.textContent).toContain(
            'Это предварительная структура сетки',
        );
        expect(fixture.nativeElement.textContent).not.toContain(
            'участники и матчи пока не опубликованы',
        );
    });

    function createFixture(
        inputs: { compact?: boolean; groupId?: number } = {},
    ): ComponentFixture<TournamentPublicViewComponent> {
        const result = TestBed.createComponent(TournamentPublicViewComponent);
        result.componentRef.setInput('tournamentId', 1);
        if (inputs.compact !== undefined) {
            result.componentRef.setInput('compact', inputs.compact);
        }
        if (inputs.groupId !== undefined) {
            result.componentRef.setInput('groupId', inputs.groupId);
        }
        result.detectChanges();
        return result;
    }
});

function pendingMatch(
    position: string,
    roundType: 'semi_final' | 'third_place' | 'final',
    homeSourceLabel: string,
    awaySourceLabel: string,
) {
    return {
        position,
        roundType,
        roundNumber: roundType === 'semi_final' ? 1 : 2,
        status: 'pending' as const,
        homeSourceLabel,
        awaySourceLabel,
    };
}

function standing(teamId: number, teamName: string): StandingRow {
    return {
        position: 1,
        team: { id: teamId, name: teamName },
        played: 3,
        wins: 2,
        draws: 1,
        losses: 0,
        goalsFor: 6,
        goalsAgainst: 2,
        goalDifference: 4,
        points: 7,
        qualificationStatus: 'pending',
    };
}

function view(): PublicTournamentView {
    return {
        tournament: { id: 1, name: 'Дворовая лига' },
        activeStageId: 10,
        stages: [
            {
                id: 10,
                key: 'groups',
                name: 'Групповой этап',
                type: 'group_stage',
                order: 1,
                status: 'active',
                groups: [],
                standings: [],
                crossGroupRankings: [],
                bracket: { confirmed: false, matches: [] },
                empty: false,
            },
            {
                id: 20,
                key: 'playoff',
                name: 'Плей-офф',
                type: 'knockout',
                order: 2,
                status: 'pending',
                groups: [],
                standings: [],
                crossGroupRankings: [],
                bracket: { confirmed: false, matches: [] },
                empty: false,
            },
        ],
    };
}
