import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { MatchRosterCheckStore } from '../../entities/match-roster/model/match-roster-check.store';
import { MatchRosterApi } from '../../entities/match-roster/api/match-roster.api';
import { MatchResultTeamsComponent } from './match-result-teams.component';

describe('Aggregate-aware manual results', () => {
    let component: MatchResultTeamsComponent;
    let match: { [key: string]: any };

    beforeEach(() => {
        match = {
            id: 1,
            status: 'scheduled',
            homeScore: 0,
            awayScore: 0,
            homeTeam: { id: 10, name: 'А' },
            awayTeam: { id: 20, name: 'Б' },
            extraTimeEnabled: false,
            penaltyShootout: { initialKicksPerTeam: 5, suddenDeath: true },
            knockoutTie: {
                leg: 2,
                legs: 2,
                firstLegOfficial: true,
                previousScore: { home: 0, away: 2 },
            },
        };
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: {
                            paramMap: convertToParamMap({ matchId: '1' }),
                        },
                    },
                },
                {
                    provide: Router,
                    useValue: {
                        url: '/dashboard/match-results/1',
                        navigate: jasmine.createSpy(),
                    },
                },
                {
                    provide: MatchRosterCheckStore,
                    useValue: {
                        load: jasmine.createSpy(),
                        data: signal({ match }),
                    },
                },
                {
                    provide: MatchRosterApi,
                    useValue: { getManualEvents: () => of([]) },
                },
            ],
        });
        component = TestBed.runInInjectionContext(
            () => new MatchResultTeamsComponent(),
        );
    });

    function homeGoals(count: number) {
        component.events = Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            matchId: 1,
            teamId: 10,
            eventType: 'goal' as const,
            minute: i + 1,
            half: 1 as const,
            isCancelled: false,
        }));
    }

    it('requires penalties for 2:0 in the return leg after a 0:2 first leg', () => {
        homeGoals(2);
        expect(component.homeScore).toBe(2);
        expect(component.requiresPenaltyShootout).toBeTrue();
    });
    it('does not request penalties for a drawn return match with a non-tied aggregate', () => {
        expect(component.requiresPenaltyShootout).toBeFalse();
    });
    it('does not offer penalties without an official first-leg result', () => {
        homeGoals(2);
        match['knockoutTie'].firstLegOfficial = false;
        expect(component.requiresPenaltyShootout).toBeFalse();
    });
    it('uses extra-time goals in deciding whether the aggregate requires penalties', () => {
        homeGoals(2);
        match['extraTimeEnabled'] = true;
        expect(component.requiresExtraTime).toBeTrue();
        expect(component.requiresPenaltyShootout).toBeTrue();
        component.extraAwayScore = 1;
        expect(component.requiresPenaltyShootout).toBeFalse();
    });
});
