import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
    ActivatedRoute,
    convertToParamMap,
    provideRouter,
} from '@angular/router';
import { PlayoffLaunchPageComponent } from './playoff-launch-page.component';
import { PlayoffLaunchState } from './playoff-launch.types';

describe('Eight-team playoff launch', () => {
    let component: PlayoffLaunchPageComponent;
    let http: HttpTestingController;
    let page: HTMLElement;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PlayoffLaunchPageComponent],
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                provideRouter([]),
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: {
                            queryParamMap: convertToParamMap({
                                tournamentId: '10',
                            }),
                        },
                    },
                },
            ],
        }).compileComponents();
        const fixture = TestBed.createComponent(PlayoffLaunchPageComponent);
        component = fixture.componentInstance;
        http = TestBed.inject(HttpTestingController);
        http.expectOne('/api/tournaments/10/playoff-launch').flush(state());
        fixture.detectChanges();
        page = fixture.nativeElement as HTMLElement;
    });

    afterEach(() => http.verify());

    it('shows the actual 1–3 / 2–4 routes before launch', () => {
        const text = page.querySelector(
            '[aria-label="Схема переходов в полуфиналы"]',
        )?.textContent;
        expect(text).toContain('1–3 / 2–4');
        expect(text).toContain('победитель QF-1 — победитель QF-3');
        expect(text).toContain('победитель QF-2 — победитель QF-4');
    });

    it('selects eight qualifiers and creates four cross-group quarter-final pairs', () => {
        expect(component.selectedIds().length).toBe(8);
        expect(component.pairs()).toEqual([
            { homeTournamentTeamId: 1, awayTournamentTeamId: 8 },
            { homeTournamentTeamId: 2, awayTournamentTeamId: 7 },
            { homeTournamentTeamId: 3, awayTournamentTeamId: 6 },
            { homeTournamentTeamId: 4, awayTournamentTeamId: 5 },
        ]);
        expect(component.schedule().length).toBe(14);
        expect(component.canLaunch()).toBeFalse();
    });

    it('requires a schedule for every fixture and rejects repeated teams in pairs', () => {
        component.schedule().forEach((_, i) => {
            component.updateSchedule(
                i,
                'matchDatetime',
                `2027-02-${String(i + 1).padStart(2, '0')}T09:00`,
            );
            component.updateSchedule(i, 'venueId', 1);
        });
        expect(component.canLaunch()).toBeTrue();
        component.updatePair(1, 'homeTournamentTeamId', 1);
        expect(component.canLaunch()).toBeFalse();
    });

    it('posts all fourteen fixture dates and four manual pairs', () => {
        component.schedule().forEach((_, i) => {
            component.updateSchedule(
                i,
                'matchDatetime',
                `2027-02-${String(i + 1).padStart(2, '0')}T09:00`,
            );
            component.updateSchedule(i, 'venueId', 1);
        });
        component.launch();
        const req = http.expectOne('/api/tournaments/10/playoff-launch');
        expect(req.request.method).toBe('POST');
        expect(req.request.body.manualPairs.length).toBe(4);
        expect(req.request.body.schedule.length).toBe(14);
        expect(req.request.body.schedule[1].bracketPosition).toBe('QF-1:L2');
        req.flush({ ...state(), launched: true });
    });
});

function state(): PlayoffLaunchState {
    const positions = [
        ...Array.from({ length: 4 }, (_, i) => `QF-${i + 1}`),
        'SF-1',
        'SF-2',
    ]
        .flatMap((position) => [`${position}:L1`, `${position}:L2`])
        .concat(['THIRD_PLACE', 'FINAL']);
    return {
        tournament: { id: 10, name: 'Кубок' },
        groupStage: {
            id: 1,
            name: 'Группы',
            allMatchesFinished: true,
            unfinishedMatches: 0,
            standingsReady: true,
        },
        knockoutStage: {
            id: 2,
            name: 'Плей-офф',
            bracketSize: 8,
            semiFinalPairing: 'cross',
            semiFinalSources: [
                { position: 'SF-1', home: 'QF-1', away: 'QF-3' },
                { position: 'SF-2', home: 'QF-2', away: 'QF-4' },
            ],
            expectedMatches: positions.map((bracketPosition) => ({
                bracketPosition,
                label: bracketPosition,
            })),
        },
        groups: [0, 1].map((group) => ({
            id: group + 1,
            name: `Группа ${group}`,
            standings: Array.from({ length: 4 }, (_, i) => ({
                tournamentTeamId: group * 4 + i + 1,
                team: {
                    id: group * 4 + i + 1,
                    name: `Команда ${group * 4 + i + 1}`,
                },
                position: i + 1,
                played: 7,
                wins: 1,
                draws: 1,
                losses: 5,
                goalsFor: 1,
                goalsAgainst: 2,
                goalDifference: -1,
                points: 4,
            })),
        })),
        suggestedTournamentTeamIds: [1, 2, 3, 4, 5, 6, 7, 8],
        venues: [{ id: 1, name: 'Зал' }],
        launched: false,
        matches: [],
    };
}
