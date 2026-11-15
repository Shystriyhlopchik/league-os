import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { SessionStore } from './session.store';
import { AuthApi } from '../api/auth.api';
import { TokenStorage } from '../../../shared/lib/storage/token-storage';

describe('Same-account offline session recovery', () => {
    let token: string | null;
    let api: jasmine.SpyObj<AuthApi>;
    const user = { id: 7, username: 'Referee', firstName: 'Test', lastName: 'Referee', email: null, roles: ['referee'] };
    beforeEach(() => {
        token = 'local-test-token';
        api = jasmine.createSpyObj('AuthApi', ['me']);
        TestBed.configureTestingModule({ providers: [SessionStore,
            { provide: AuthApi, useValue: api },
            { provide: TokenStorage, useValue: { getAccessToken: () => token, clear: () => token = null, setAccessToken: (v: string) => token = v } },
        ] });
        localStorage.setItem('offline_match_identity', JSON.stringify({ token, user }));
    });
    afterEach(() => { localStorage.removeItem('offline_match_identity'); TestBed.resetTestingModule(); });
    it('preserves a previously authenticated identity on a network outage', () => {
        api.me.and.returnValue(throwError(() => ({ status: 0 })));
        const store = TestBed.inject(SessionStore); store.init();
        expect(store.user()?.id).toBe(7);
        expect(store.isInitialized()).toBeTrue();
        expect(token).not.toBeNull();
    });
    it('does not use a cached identity for a different token/account', () => {
        token = 'different-account-token';
        api.me.and.returnValue(throwError(() => ({ status: 0 })));
        const store = TestBed.inject(SessionStore); store.init();
        expect(store.user()).toBeNull();
    });
    it('does not bypass a server rejection with an offline identity', () => {
        api.me.and.returnValue(throwError(() => ({ status: 401 })));
        const store = TestBed.inject(SessionStore); store.init();
        expect(store.user()).toBeNull();
        expect(token).toBeNull();
    });
});
