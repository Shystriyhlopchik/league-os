import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom, Observable, of } from 'rxjs';
import { AuthApi } from '../entities/user/api/auth.api';
import { SessionStore } from '../entities/user/model/session.store';
import { communityNewsGuard } from './community-news.guard';

describe('Community news access', () => {
    it('uses community rights rather than a global admin role', async () => {
        const capability = jasmine.createSpy().and.returnValue(false);
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
                        updateUser: () => {},
                        canManageCommunityNews: capability,
                    },
                },
            ],
        });
        const run = () =>
            firstValueFrom(
                TestBed.runInInjectionContext(() =>
                    communityNewsGuard({} as never, {} as never),
                ) as Observable<unknown>,
            );
        expect(
            TestBed.inject(Router).serializeUrl((await run()) as never),
        ).toBe('/dashboard');
        capability.and.returnValue(true);
        expect(await run()).toBeTrue();
    });
});
