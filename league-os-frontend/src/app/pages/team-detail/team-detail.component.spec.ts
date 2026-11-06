import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
    ActivatedRoute,
    convertToParamMap,
    provideRouter,
} from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { TeamDetailComponent } from './team-detail.component';
import {
    ClubStatistics,
    TeamOverview,
    TeamPublicApi,
} from '../../entities/team/api/team-public.api';

describe('TeamDetailComponent club tabs', () => {
    let fixture: ComponentFixture<TeamDetailComponent>;
    let queries: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
    let api: { overview: jasmine.Spy; statistics: jasmine.Spy };
    const overview: TeamOverview = {
        team: {
            id: 2,
            name: 'Север',
            slug: 'sever',
            isActive: true,
            city: 'Чебоксары',
            description: 'История команды',
        },
        communityId: 1,
        communities: [{ id: 1, name: 'Дворовая лига' }],
        roster: [
            {
                playerId: 1,
                name: 'Иван Сегодня',
                photoUrl: '/current.jpg',
                shirtNumber: 9,
                position: 'forward',
                isCaptain: true,
            },
        ],
        tournaments: [
            {
                id: 3,
                name: 'Летний кубок',
                seasonId: 1,
                seasonName: 'Лето 2026',
                year: 2026,
                completed: true,
                status: 'completed',
                place: 1,
                result: '1-е место',
            },
            {
                id: 4,
                name: 'Футзал',
                seasonId: 2,
                seasonName: 'Зима 2026/27',
                year: 2026,
                completed: false,
                status: 'in_progress',
                place: null,
                result: 'Участие в турнире',
            },
        ],
        matches: [
            {
                id: 1,
                tournamentId: 3,
                tournamentName: 'Летний кубок',
                matchDatetime: '2026-06-01T12:00:00',
                round: 'Финал',
                status: 'finished',
                homeTeam: { id: 2, name: 'Север', logoUrl: null },
                awayTeam: { id: 5, name: 'Юг', logoUrl: null },
                homeScore: 3,
                awayScore: 1,
                winnerTeamId: 2,
                venue: 'ФСК Восток',
            },
            {
                id: 2,
                tournamentId: 4,
                tournamentName: 'Футзал',
                matchDatetime: '2099-12-01T12:00:00',
                round: '2 тур',
                status: 'scheduled',
                homeTeam: { id: 2, name: 'Север', logoUrl: null },
                awayTeam: { id: 5, name: 'Юг', logoUrl: null },
                homeScore: null,
                awayScore: null,
                winnerTeamId: null,
                venue: null,
            },
            {
                id: 3,
                tournamentId: 4,
                tournamentName: 'Футзал',
                matchDatetime: null,
                round: null,
                status: 'scheduled',
                homeTeam: null,
                awayTeam: { id: 2, name: 'Север', logoUrl: null },
                homeScore: null,
                awayScore: null,
                winnerTeamId: null,
                venue: null,
            },
        ],
        videos: [
            {
                id: 8,
                title: 'Запись финала',
                embedUrl: 'https://vkvideo.ru/video_ext.php?oid=-1&id=8',
                coverUrl: '/cover.jpg',
                publishedAt: '2026-06-02T12:00:00',
                tournamentId: 3,
                matchId: 1,
            },
        ],
    };
    const statistics: ClubStatistics = {
        communityId: 1,
        totals: {
            matches: 1,
            wins: 1,
            draws: 0,
            losses: 0,
            goalsFor: 3,
            goalsAgainst: 1,
        },
        players: [
            {
                playerId: 99,
                name: 'Пётр Бывший',
                photoUrl: null,
                matches: 1,
                goals: 3,
                assists: 2,
                yellowCards: 1,
                secondYellowCards: 0,
                redCards: 0,
            },
        ],
    };
    beforeEach(async () => {
        queries = new BehaviorSubject(convertToParamMap({}));
        api = {
            overview: jasmine.createSpy().and.returnValue(of(overview)),
            statistics: jasmine.createSpy().and.returnValue(of(statistics)),
        };
        await TestBed.configureTestingModule({
            imports: [TeamDetailComponent],
            providers: [
                provideRouter([]),
                {
                    provide: ActivatedRoute,
                    useValue: {
                        paramMap: of(convertToParamMap({ teamId: '2' })),
                        queryParamMap: queries,
                    },
                },
                { provide: TeamPublicApi, useValue: api },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(TeamDetailComponent);
        fixture.detectChanges();
    });
    const html = () => fixture.nativeElement as HTMLElement;
    const tab = (value: string) => {
        queries.next(convertToParamMap({ tab: value }));
        fixture.detectChanges();
    };
    it('offers five navigable sections and separates upcoming and finished fixtures', () => {
        expect(html().querySelectorAll('.club-tabs a').length).toBe(5);
        expect(html().textContent).toContain('VS');
        expect(html().textContent).toContain('Дата уточняется');
        expect(fixture.componentInstance.matches().map((m) => m.id)).toEqual([
            2, 3,
        ]);
        fixture.componentInstance.setPeriod('past');
        fixture.detectChanges();
        expect(fixture.componentInstance.matches().map((m) => m.id)).toEqual([
            1,
        ]);
        expect(html().querySelector('.fixture-score')?.textContent).toContain(
            '3:1',
        );
    });
    it('shows current players only in the roster with photo, shirt number, position and a profile link', () => {
        tab('roster');
        const card = html().querySelector('.roster-card') as HTMLAnchorElement;
        expect(card.href).toContain('/team/2/players/1?communityId=1');
        expect(card.textContent).toContain('9');
        expect(card.textContent).toContain('Нападающий');
        expect(card.querySelector('img')?.getAttribute('src')).toBe(
            '/current.jpg',
        );
        expect(html().textContent).not.toContain('Пётр Бывший');
    });
    it('keeps historical leaders who are absent from the current roster', () => {
        tab('statistics');
        expect(html().textContent).toContain('Пётр Бывший');
        expect(html().querySelectorAll('.leader-row').length).toBe(3);
        expect(
            (html().querySelector('.leader-row') as HTMLAnchorElement).href,
        ).toContain('/players/99');
    });
    it('sends intersecting filters to the API and resets the tournament when the season changes', () => {
        const c = fixture.componentInstance;
        c.setFilter('tournamentId', '3');
        c.setFilter('year', '2026');
        expect(api.statistics).toHaveBeenCalledWith(2, 1, {
            tournamentId: 3,
            year: 2026,
        });
        c.setFilter('seasonId', '2');
        expect(c.filters()).toEqual({ seasonId: 2, year: 2026 });
        expect(c.statsTournaments().map((t) => t.id)).toEqual([4]);
        c.resetFilters();
        expect(c.filters()).toEqual({});
    });
    it('does not reload the overview when switching tabs, but does when changing community', () => {
        tab('roster');
        tab('about');
        expect(api.overview).toHaveBeenCalledTimes(1);
        queries.next(convertToParamMap({ communityId: '4', tab: 'matches' }));
        fixture.detectChanges();
        expect(api.overview).toHaveBeenCalledWith(2, 4);
    });
    it('shows a useful statistics error instead of silently rendering old data', () => {
        api.statistics.and.returnValue(throwError(() => new Error('offline')));
        fixture.componentInstance.loadStats();
        tab('statistics');
        expect(html().textContent).toContain('Не удалось загрузить статистику');
        expect(html().querySelector('table')).toBeNull();
    });
    it('cancels outdated statistics requests when the filter changes', () => {
        const stale = new Subject<ClubStatistics>();
        api.statistics.and.returnValue(stale);
        fixture.componentInstance.setFilter('year', '2026');
        api.statistics.and.returnValue(of({ ...statistics, players: [] }));
        fixture.componentInstance.setFilter('year', '2027');
        stale.next(statistics);
        expect(fixture.componentInstance.stats()?.players).toEqual([]);
    });
    it('shows all linked match videos and plays them without leaving the page', () => {
        tab('media');
        const dialog = fixture.debugElement.injector.get(Dialog);
        spyOn(dialog, 'open').and.returnValue({ close() {} } as never);
        (html().querySelector('.video-card') as HTMLButtonElement).click();
        expect(dialog.open).toHaveBeenCalled();
        expect(html().textContent).toContain('Запись финала');
    });
    it('shows achievements and the complete tournament history', () => {
        tab('about');
        expect(html().textContent).toContain('Чемпионы');
        expect(html().querySelectorAll('.history-list a').length).toBe(2);
        expect(html().textContent).toContain('История команды');
    });
});
