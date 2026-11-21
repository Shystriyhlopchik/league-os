import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SessionStore } from './session.store';
import { AuthApi } from '../api/auth.api';
import { TokenStorage } from '../../../shared/lib/storage/token-storage';
import { User } from './user.types';

describe('Explicit team access in the session', () => {
    let session: SessionStore;
    const manager = {
        id: 8,
        roles: ['user'],
        captainTeamIds: [],
        teamAccess: [
            {
                communityId: 2,
                teamId: 7,
                role: 'manager',
                permissions: ['team.matchRoster.edit'],
            },
        ],
    } as unknown as User;
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                SessionStore,
                {
                    provide: TokenStorage,
                    useValue: { getAccessToken: () => 'test' },
                },
                {
                    provide: AuthApi,
                    useValue: { me: () => of({ ...manager, teamAccess: [] }) },
                },
            ],
        });
        session = TestBed.inject(SessionStore);
    });
    it('allows a non-playing manager only within the granted community', () => {
        session.user.set(manager);
        expect(session.canPrepareMatchProtocol()).toBeTrue();
        expect(session.canManageTeam(7, 2)).toBeTrue();
        expect(session.canManageTeam(7, 1)).toBeFalse();
        expect(session.canManageTeam(7)).toBeFalse();
        expect(session.canManageTeam(7, 2, 'team.access.manage')).toBeFalse();
    });
    it('does not infer permission from playing captain or obsolete ID arrays', () => {
        session.user.set({
            ...manager,
            roles: ['captain'],
            captainTeamIds: [7],
            manageableTeamIds: [7],
            teamAccess: [],
        } as unknown as User);
        expect(session.canPrepareMatchProtocol()).toBeFalse();
        expect(session.canManageTeam(7, 2)).toBeFalse();
    });
    it('refresh removes a revoked grant from the UI', () => {
        session.user.set(manager);
        session.refreshUser().subscribe();
        expect(session.canPrepareMatchProtocol()).toBeFalse();
        expect(session.canManageTeam(7, 2)).toBeFalse();
    });
});
