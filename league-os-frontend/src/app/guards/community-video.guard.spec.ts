import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom, Observable, of } from 'rxjs';
import { AuthApi } from '../entities/user/api/auth.api';
import { SessionStore } from '../entities/user/model/session.store';
import { communityVideoGuard } from './community-video.guard';

describe('Community video access', () => {
    it('uses community capability, not the global admin role or tournament feature flag', async () => {
        const capability = jasmine.createSpy().and.returnValue(false);
        const updateUser = jasmine.createSpy();
        TestBed.configureTestingModule({
            providers: [
                provideRouter([]),
                {
                    provide: AuthApi,
                    useValue: { me: () => of({ id: 1, roles: ['admin'] }) },
                },
                {
                    provide: SessionStore,
                    useValue: {
                        updateUser,
                        canManageCommunityVideos: capability,
                    },
                },
            ],
        });
        const run = () =>
            firstValueFrom(
                TestBed.runInInjectionContext(() =>
                    communityVideoGuard({} as never, {} as never),
                ) as Observable<unknown>,
            );
        const rejected = await run();
        expect(TestBed.inject(Router).serializeUrl(rejected as never)).toBe(
            '/dashboard',
        );
        capability.and.returnValue(true);
        expect(await run()).toBeTrue();
        expect(updateUser).toHaveBeenCalled();
    });
});
