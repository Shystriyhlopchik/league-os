import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatchProtocolStore } from './match-protocol.store';
import {
    MatchProtocolJournal,
    ProtocolJournal,
} from './match-protocol-journal';
import { MatchServiceApi } from '../../../entities/match-service/api/match-service.api';
import { SessionStore } from '../../../entities/user/model/session.store';
import { MatchProtocolData } from '../../../entities/match-service/model/match-service.types';
import { projectCommand } from './match-command-state';

function fixture(): MatchProtocolData {
    return {
        match: {
            id: 99,
            tournamentId: 1,
            status: 'scheduled',
            homeTeam: { id: 10, name: 'Home' },
            awayTeam: { id: 20, name: 'Away' },
        },
        session: {
            id: 1,
            matchId: 99,
            revision: 0,
            status: 'not_started',
            currentHalf: 1,
            elapsedSeconds: 0,
            homeScore: 0,
            awayScore: 0,
        },
        rosters: { home: [], away: [] },
        events: [],
        redBalls: { active: [], usedTeamIds: [] },
    };
}

describe('Persistent match protocol journal', () => {
    let saved: ProtocolJournal | undefined;
    let quotaFailure: boolean;
    let api: jasmine.SpyObj<MatchServiceApi>;
    let online: jasmine.Spy;
    const settle = async () => {
        for (let i = 0; i < 8; i++)
            await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const setup = () => {
        TestBed.configureTestingModule({
            providers: [
                MatchProtocolStore,
                { provide: MatchServiceApi, useValue: api },
                {
                    provide: SessionStore,
                    useValue: {
                        user: signal({ id: 7 }),
                        canManageCommunityTournaments: () => true,
                    },
                },
                {
                    provide: MatchProtocolJournal,
                    useValue: {
                        read: async () => structuredClone(saved),
                        save: async (value: ProtocolJournal) => {
                            if (quotaFailure) throw new Error('Quota exceeded');
                            saved = structuredClone(value);
                        },
                    },
                },
            ],
        });
        return TestBed.inject(MatchProtocolStore);
    };
    beforeEach(() => {
        saved = undefined;
        quotaFailure = false;
        online = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(
            true,
        );
        api = jasmine.createSpyObj('MatchServiceApi', [
            'getSession',
            'command',
        ]);
        api.getSession.and.returnValue(of(fixture()));
        api.command.and.callFake((_id, command) =>
            of({ data: projectCommand(saved!.confirmed, command) }),
        );
    });
    afterEach(() => TestBed.resetTestingModule());

    it('stores before HTTP and restores unsent actions after reopening without internet', async () => {
        let store = setup();
        await store.load(99);
        online.and.returnValue(false);
        store.start(99);
        await settle();
        expect(saved?.pending.length).toBe(1);
        expect(api.command).not.toHaveBeenCalled();
        TestBed.resetTestingModule();
        store = setup();
        await store.load(99);
        expect(store.session()?.status).toBe('first_half');
        expect(store.pendingCount()).toBe(1);
        online.and.returnValue(true);
        await store.synchronize();
        expect(saved?.pending.length).toBe(0);
        expect(store.session()?.revision).toBe(1);
    });

    it('retains the exact command UUID after a lost response', async () => {
        const store = setup();
        await store.load(99);
        api.command.and.returnValue(throwError(() => ({ status: 0 })));
        store.start(99);
        await settle();
        const id = saved!.pending[0].id;
        api.command.and.callFake((_match, command) => {
            expect(command.id).toBe(id);
            return of({ data: projectCommand(saved!.confirmed, command) });
        });
        await store.synchronize();
        expect(store.pendingCount()).toBe(0);
    });

    it('does not discard the queue or overwrite local state on conflict', async () => {
        const store = setup();
        await store.load(99);
        api.command.and.returnValue(
            throwError(() => ({
                status: 409,
                error: { message: 'Other device changed the match' },
            })),
        );
        store.start(99);
        await settle();
        expect(store.conflict()).toBeTrue();
        expect(store.pendingCount()).toBe(1);
        expect(store.session()?.status).toBe('first_half');
        await store.synchronize();
        expect(api.command).toHaveBeenCalledTimes(1);
    });

    it('never claims a local action was saved when persistent storage fails', async () => {
        const store = setup();
        await store.load(99);
        quotaFailure = true;
        store.start(99);
        await settle();
        expect(store.session()?.status).toBe('not_started');
        expect(store.pendingCount()).toBe(0);
        expect(store.error()).toContain('Quota');
        expect(api.command).not.toHaveBeenCalled();
    });

    it('requires connectivity and an empty queue to sign', async () => {
        const store = setup();
        await store.load(99);
        online.and.returnValue(false);
        store.signProtocol(99);
        await settle();
        expect(api.command).not.toHaveBeenCalled();
        expect(store.error()).toContain('связи');
    });
});
