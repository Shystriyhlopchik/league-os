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

    const staleMatch = () => {
        const data = fixture();
        data.match.status = 'live';
        data.session.status = 'first_half';
        data.session.revision = 3;
        data.session.elapsedSeconds = 120;
        data.session.startedAt = new Date(Date.now() - 2 * 86400000).toISOString();
        return data;
    };

    it('blocks an over-limit event before persistence or HTTP and explains recovery', async () => {
        api.getSession.and.returnValue(of(staleMatch()));
        const store = setup();
        await store.load(99);
        const draft = jasmine.createSpy('draft');
        store.startEventRecording(99, 'goal', draft);
        await settle();
        expect(api.command).not.toHaveBeenCalled();
        expect(store.pendingCount()).toBe(0);
        expect(saved!.confirmed.session.status).toBe('first_half');
        expect(draft).not.toHaveBeenCalled();
        expect(store.error()).toContain('Восстановление после сбоя');
    });

    it('recovers a days-old clock then records an event using actual playing time', async () => {
        api.getSession.and.returnValue(of(staleMatch()));
        const store = setup();
        await store.load(99);
        store.recover('Матч уже состоялся, связь отсутствовала', 1200);
        await settle();
        expect(api.command.calls.mostRecent().args[1].action).toBe('recover');
        expect(api.command.calls.mostRecent().args[1].elapsedSeconds).toBe(1200);
        expect(store.session()?.status).toBe('paused');
        expect(store.session()?.currentHalf).toBe(2);
        expect(store.session()?.startedAt).toBeNull();
        store.resume(99);
        await settle();
        const draft = jasmine.createSpy('draft');
        store.startEventRecording(99, 'goal', draft);
        await settle();
        expect(draft).toHaveBeenCalled();
        const event = draft.calls.mostRecent().args[0].eventDraft;
        expect(event.second).toBeLessThan(1210);
        expect(event.second).toBeGreaterThanOrEqual(1200);
        store.createEvent(99, { ...event, teamId: 10, playerId: 3, autoResume: true });
        await settle();
        expect(store.session()?.homeScore).toBe(1);
        expect(store.pendingCount()).toBe(0);
        expect(api.command.calls.allArgs().every(([, c]) => c.elapsedSeconds <= 86400)).toBeTrue();
    });

    it('validates manually supplied recovery seconds and reason', async () => {
        api.getSession.and.returnValue(of(staleMatch()));
        const store = setup();
        await store.load(99);
        for (const seconds of [86401, -1, NaN, 12.5]) {
            store.recover('Сбой', seconds);
            expect(store.error()).toContain('целое число секунд');
        }
        store.recover('  ', 1200);
        expect(store.error()).toContain('причину');
        expect(api.command).not.toHaveBeenCalled();
        expect(store.pendingCount()).toBe(0);
    });

    it('keeps an invalid legacy queue unchanged and allows explicit reconciliation before recovery', async () => {
        const confirmed = staleMatch();
        api.getSession.and.returnValue(of(confirmed));
        saved = { key: '7:99', confirmed, pending: [{ id: crypto.randomUUID(),
            action: 'start-recording', eventType: 'goal', expectedRevision: 3,
            occurredAt: new Date().toISOString(), elapsedSeconds: 172920 }] };
        const original = structuredClone(saved);
        const store = setup();
        await store.load(99);
        await settle();
        expect(store.conflict()).toBeTrue();
        expect(saved).toEqual(original);
        expect(api.command).not.toHaveBeenCalled();
        expect(store.error()).toContain('Локальная очередь сохранена');
        store.recover('Сбой', 1200);
        await settle();
        expect(saved).toEqual(original);
        await store.compareWithServer();
        spyOn(window, 'confirm').and.returnValue(true);
        const backup = spyOn(store, 'exportJournal');
        await store.useServerVersion();
        expect(backup).toHaveBeenCalled();
        expect(store.conflict()).toBeFalse();
        store.recover('Сверка выполнена', 1200);
        await settle();
        expect(store.session()?.status).toBe('paused');
        expect(store.session()?.elapsedSeconds).toBe(1200);
    });

    const resetResponse = () => {
        const data = fixture();
        data.session.revision = 4;
        return { data };
    };

    it('resets online even with an invalid pending queue, backing it up before clearing', async () => {
        const confirmed = staleMatch();
        api.getSession.and.returnValue(of(confirmed));
        saved = { key: '7:99', confirmed, pending: [{ id: crypto.randomUUID(),
            action: 'start-recording', eventType: 'goal', expectedRevision: 3,
            occurredAt: new Date().toISOString(), elapsedSeconds: 172920 }] };
        const store = setup();
        await store.load(99);
        await settle();
        expect(store.conflict()).toBeTrue();
        const backup = spyOn(store, 'exportJournal');
        api.command.and.callFake((_match, command) => {
            expect(backup).toHaveBeenCalled();
            expect(saved!.pending.length).toBe(1);
            expect(saved!.resetCommand).toEqual(command);
            expect(command).toEqual(jasmine.objectContaining({ action: 'reset', expectedRevision: 3, elapsedSeconds: 0 }));
            return of(resetResponse());
        });
        await store.resetService('Ошибочный запуск', true);
        expect(store.session()?.status).toBe('not_started');
        expect(store.match()?.status).toBe('scheduled');
        expect(store.session()?.elapsedSeconds).toBe(0);
        expect(store.pendingCount()).toBe(0);
        expect(store.conflict()).toBeFalse();
        expect(store.resetPending()).toBeFalse();
        expect(saved!.resetCommand).toBeUndefined();
        expect(store.notice()).toContain('протокол вручную');
    });

    it('requires explicit confirmation, a reason and connectivity before resetting', async () => {
        api.getSession.and.returnValue(of(staleMatch()));
        const store = setup();
        await store.load(99);
        const original = structuredClone(saved);
        const backup = spyOn(store, 'exportJournal');
        await store.resetService('Сбой', false);
        expect(store.error()).toContain('подтвердите');
        await store.resetService(' ', true);
        expect(store.error()).toContain('причину');
        online.and.returnValue(false);
        await store.resetService('Сбой', true);
        expect(store.error()).toContain('связи');
        expect(api.command).not.toHaveBeenCalled();
        expect(backup).not.toHaveBeenCalled();
        expect(saved).toEqual(original);
    });

    it('preserves a reset UUID across lost responses and reloads without replaying old actions', async () => {
        api.getSession.and.returnValue(of(staleMatch()));
        let store = setup();
        await store.load(99);
        spyOn(store, 'exportJournal');
        api.command.and.returnValue(throwError(() => ({ status: 0 })));
        await store.resetService('Сбой', true);
        const command = structuredClone(saved!.resetCommand!);
        expect(command.action).toBe('reset');
        expect(store.resetPending()).toBeTrue();
        expect(store.session()?.status).toBe('first_half');
        expect(store.notice()).toBeNull();
        TestBed.resetTestingModule();
        store = setup();
        await store.load(99);
        await settle();
        expect(saved!.resetCommand).toEqual(command);
        expect(api.command).toHaveBeenCalledTimes(1);
        api.command.and.callFake((_id, retried) => {
            expect(retried).toEqual(command);
            return of(resetResponse());
        });
        await store.resetService('Повторная попытка', true);
        expect(saved!.resetCommand).toBeUndefined();
        expect(store.session()?.revision).toBe(4);
        expect(store.session()?.status).toBe('not_started');
    });

    it('preserves the journal when the server refuses a reset with game events', async () => {
        api.getSession.and.returnValue(of(staleMatch()));
        const store = setup();
        await store.load(99);
        spyOn(store, 'exportJournal');
        api.command.and.returnValue(throwError(() => ({ status: 409, error: { message: 'В протоколе есть игровые события' } })));
        await store.resetService('Сбой', true);
        expect(store.error()).toContain('игровые события');
        expect(store.notice()).toBeNull();
        expect(store.session()?.status).toBe('first_half');
        expect(saved!.confirmed.match.status).toBe('live');
    });

    it('does not send a reset if persisting its retry marker fails', async () => {
        api.getSession.and.returnValue(of(staleMatch()));
        const store = setup();
        await store.load(99);
        spyOn(store, 'exportJournal');
        quotaFailure = true;
        await store.resetService('Сбой', true);
        expect(api.command).not.toHaveBeenCalled();
        expect(store.error()).toContain('Quota');
        expect(saved!.resetCommand).toBeUndefined();
    });
});
