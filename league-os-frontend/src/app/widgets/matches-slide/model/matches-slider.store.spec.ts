import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { MatchApi } from '../../../entities/match/api/match.api';
import { Match } from '../../../entities/match/model/match.types';
import { MatchesSliderStore } from './matches-slider.store';

describe('MatchesSliderStore community feed', () => {
    let store: MatchesSliderStore;
    let api: jasmine.SpyObj<MatchApi>;
    const match = (id: number, tournamentId: number): Match => ({
        id,
        tournamentId,
        round: '1',
        status: 'scheduled',
        matchDateTime: '2026-11-08T10:00:00',
        homeTeam: { id: 10, name: 'Home', shortName: 'H', logoUrl: null },
        awayTeam: { id: 20, name: 'Away', shortName: 'A', logoUrl: null },
        score: { home: 0, away: 0 },
        venue: null,
        tournament: {
            id: tournamentId,
            name: `Tournament ${tournamentId}`,
            season: { year: 2026 },
        } as Match['tournament'],
    });
    beforeEach(() => {
        api = jasmine.createSpyObj<MatchApi>('MatchApi', [
            'getActiveCommunityMatches',
            'getBySeason',
            'getByTournament',
        ]);
        TestBed.configureTestingModule({
            providers: [
                MatchesSliderStore,
                { provide: MatchApi, useValue: api },
            ],
        });
        store = TestBed.inject(MatchesSliderStore);
    });
    it('loads all current community tournaments without requesting a single season or tournament', () => {
        api.getActiveCommunityMatches.and.returnValue(
            of([match(1, 2), match(2, 3)]),
        );
        store.loadActiveCommunity();
        expect(api.getActiveCommunityMatches).toHaveBeenCalledWith(undefined);
        expect(api.getBySeason).not.toHaveBeenCalled();
        expect(api.getByTournament).not.toHaveBeenCalled();
        expect(store.matches().map((m) => m.competitionName)).toEqual([
            'Tournament 2',
            'Tournament 3',
        ]);
        expect(store.isLoading()).toBeFalse();
    });
    it('does not fall back to past matches when the current feed is empty', () => {
        api.getActiveCommunityMatches.and.returnValue(of([]));
        store.loadActiveCommunity();
        expect(store.isEmpty()).toBeTrue();
        expect(api.getBySeason).not.toHaveBeenCalled();
    });
    it('cancels the old community request and clears its matches on community change', () => {
        const oldFeed = new Subject<Match[]>();
        const newFeed = new Subject<Match[]>();
        api.getActiveCommunityMatches.and.returnValues(oldFeed, newFeed);
        store.loadActiveCommunity(1);
        oldFeed.next([match(1, 2)]);
        store.loadActiveCommunity(7);
        expect(store.matches()).toEqual([]);
        oldFeed.next([match(9, 99)]);
        expect(store.matches()).toEqual([]);
        expect(store.isLoading()).toBeTrue();
        newFeed.next([match(2, 3)]);
        newFeed.complete();
        expect(store.matches().map((m) => m.id)).toEqual([2]);
        expect(store.isLoading()).toBeFalse();
    });
    it('shows a loading error without reusing old tournament matches', () => {
        api.getActiveCommunityMatches.and.returnValue(
            throwError(() => new Error('offline')),
        );
        store.loadActiveCommunity();
        expect(store.matches()).toEqual([]);
        expect(store.error()).toBe('Не удалось загрузить матчи');
        expect(store.isLoading()).toBeFalse();
    });
});
