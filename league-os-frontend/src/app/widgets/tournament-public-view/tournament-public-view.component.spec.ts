import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { PublicTournamentView } from '../../entities/standings/model/public-tournament-view.model';
import { SessionStore } from '../../entities/user/model/session.store';
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
            ],
        }).compileComponents();
    });

    it('shows loading and switches between stages returned by backend', () => {
        const response = new Subject<PublicTournamentView>();
        api.getPublicTournamentView.and.returnValue(response);
        fixture = createFixture();
        expect(fixture.nativeElement.textContent).toContain(
            'Загружаем турнир',
        );

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

    function createFixture(): ComponentFixture<TournamentPublicViewComponent> {
        const result = TestBed.createComponent(TournamentPublicViewComponent);
        result.componentRef.setInput('tournamentId', 1);
        result.detectChanges();
        return result;
    }
});

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
