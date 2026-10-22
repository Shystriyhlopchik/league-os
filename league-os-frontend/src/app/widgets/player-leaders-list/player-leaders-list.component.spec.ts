import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { PlayerLeadersApi } from '../../entities/tournaments/api/player-leaders.api';
import {
    PlayerLeaderboardEntry,
    PlayerLeaderboardMetric,
    PlayerLeaderboards,
} from '../../entities/tournaments/model/player-leader.types';
import { PlayerLeadersCardComponent } from '../player-leaders-card/player-leaders-card.component';
import { PlayerLeadersListComponent } from './player-leaders-list.component';

describe('PlayerLeadersListComponent', () => {
    let fixture: ComponentFixture<PlayerLeadersListComponent>;
    let getLeaderboards: jasmine.Spy;

    const leader: PlayerLeaderboardEntry = {
        position: 1,
        value: 3,
        player: { id: 1, name: 'Иван Иванов', photoUrl: null },
        team: { id: 1, name: 'Арман', logoUrl: null },
    };
    const leaderboards: PlayerLeaderboards = {
        goals: [leader],
        assists: [leader],
        yellowCards: [leader],
        redCards: [leader],
        goalContributions: [leader],
        goalsPerGame: [{ ...leader, value: 1.5 }],
    };

    beforeEach(async () => {
        getLeaderboards = jasmine.createSpy().and.returnValue(
            of({
                tournamentId: 12,
                groupId: 4,
                leaderboards,
            }),
        );

        await TestBed.configureTestingModule({
            imports: [PlayerLeadersListComponent],
            providers: [
                {
                    provide: PlayerLeadersApi,
                    useValue: { getLeaderboards },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(PlayerLeadersListComponent);
        fixture.componentRef.setInput('tournamentId', 12);
        fixture.componentRef.setInput('groupId', 4);
    });

    it('loads all leaderboards once and renders requested metrics', () => {
        const metrics: readonly PlayerLeaderboardMetric[] = [
            'goals',
            'goalContributions',
            'goalsPerGame',
        ];
        fixture.componentRef.setInput('metrics', metrics);
        fixture.detectChanges();

        const cards = fixture.debugElement.queryAll(
            By.directive(PlayerLeadersCardComponent),
        );

        expect(getLeaderboards).toHaveBeenCalledOnceWith(12, 4);
        expect(cards.length).toBe(metrics.length);
        expect(
            cards.map((card) =>
                (card.componentInstance as PlayerLeadersCardComponent).metric(),
            ),
        ).toEqual(metrics);
        expect(
            (
                cards[2].componentInstance as PlayerLeadersCardComponent
            ).leaders()[0].value,
        ).toBe(1.5);
    });

    it('does not render a card when a leaderboard is empty', () => {
        getLeaderboards.and.returnValue(
            of({
                tournamentId: 12,
                groupId: 4,
                leaderboards: {
                    ...leaderboards,
                    redCards: [],
                },
            }),
        );
        fixture.componentRef.setInput('metrics', ['goals', 'redCards']);
        fixture.detectChanges();

        const cards = fixture.debugElement.queryAll(
            By.directive(PlayerLeadersCardComponent),
        );

        expect(cards.length).toBe(1);
        expect(
            (cards[0].componentInstance as PlayerLeadersCardComponent).metric(),
        ).toBe('goals');
    });
});
