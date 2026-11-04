import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatchServiceApi } from '../../../entities/match-service/api/match-service.api';
import { MatchRegistration } from '../../../entities/match-service/model/match-service.types';
import { MatchRegistrationDetailStore } from './match-registration-detail.store';

describe('MatchRegistrationDetailStore official roster editing', () => {
    let store: MatchRegistrationDetailStore;
    let api: jasmine.SpyObj<MatchServiceApi>;
    let registration: MatchRegistration;

    beforeEach(() => {
        registration = {
            match: {
                id: 10,
                tournamentId: 1,
                status: 'scheduled',
                homeScore: 0,
                awayScore: 0,
                homeTeam: { id: 20, name: 'Хозяева' },
                awayTeam: { id: 30, name: 'Гости' },
            },
            team: { id: 20, name: 'Хозяева' },
            isSubmitted: true,
            isApproved: true,
            players: Array.from({ length: 6 }, (_, i) => ({
                id: 50 + i,
                teamPlayerId: 60 + i,
                firstName: 'Игрок',
                lastName: `${i + 1}`,
                isCaptain: i === 0,
                yellowCards: 0,
                redCards: 0,
                secondYellowCards: 0,
                eligibilityStatus: 'allowed',
                eligibilityReason: 'none',
                isSelected: i < 5,
            })),
        };
        api = jasmine.createSpyObj<MatchServiceApi>('MatchServiceApi', [
            'getMatchRegistration',
            'getMatchRegistrationByOfficial',
            'getFinishedMatchRegistration',
            'saveMatchRegistration',
            'saveMatchRegistrationByOfficial',
            'saveFinishedMatchRegistration',
        ]);
        api.getMatchRegistration.and.returnValue(of(registration));
        api.getMatchRegistrationByOfficial.and.returnValue(of(registration));
        api.getFinishedMatchRegistration.and.returnValue(of(registration));
        api.saveMatchRegistrationByOfficial.and.returnValue(of(registration));
        TestBed.configureTestingModule({
            providers: [
                MatchRegistrationDetailStore,
                { provide: MatchServiceApi, useValue: api },
            ],
        });
        store = TestBed.inject(MatchRegistrationDetailStore);
    });

    it('loads official candidates and keeps the saved selection without selecting the new player', () => {
        store.load(10, 20, false, true);
        expect(api.getMatchRegistrationByOfficial).toHaveBeenCalledWith(10, 20);
        expect(api.getMatchRegistration).not.toHaveBeenCalled();
        expect(store.registration()?.players.length).toBe(6);
        expect([...store.selectedIds()]).toEqual([60, 61, 62, 63, 64]);
        expect(store.selectedIds().has(65)).toBeFalse();
    });

    it('keeps the ordinary captain endpoint unchanged', () => {
        store.load(10, 20);
        expect(api.getMatchRegistration).toHaveBeenCalledWith(10, 20);
        expect(api.getMatchRegistrationByOfficial).not.toHaveBeenCalled();
    });

    it('keeps administrative correction on its separate endpoint', () => {
        store.load(10, 20, true, true);
        expect(api.getFinishedMatchRegistration).toHaveBeenCalledWith(10, 20);
        expect(api.getMatchRegistrationByOfficial).not.toHaveBeenCalled();
    });

    it('saves an added player through the official endpoint', () => {
        store.load(10, 20, false, true);
        store.toggle(65, true);
        store.save(10, 20, false, true);
        expect(api.saveMatchRegistrationByOfficial).toHaveBeenCalledWith(
            10,
            20,
            [60, 61, 62, 63, 64, 65],
        );
        expect(api.saveMatchRegistration).not.toHaveBeenCalled();
    });

    it('shows an error when the ordinary manual-entry endpoint rejects a signed match', () => {
        api.getMatchRegistrationByOfficial.and.returnValue(
            throwError(() => ({
                error: { message: 'Предстоящий матч не найден' },
            })),
        );
        store.load(10, 20, false, true);
        expect(store.error()).toBe('Предстоящий матч не найден');
        expect(store.isLoading()).toBeFalse();
    });
});
