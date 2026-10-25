import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthApi } from '../entities/user/api/auth.api';
import { SessionStore } from '../entities/user/model/session.store';

export const communityVideoGuard: CanActivateFn = () => {
    const store = inject(SessionStore);
    const router = inject(Router);
    return inject(AuthApi)
        .me()
        .pipe(
            map((user) => {
                store.updateUser(user);
                return (
                    store.canManageCommunityVideos() ||
                    router.createUrlTree(['/dashboard'])
                );
            }),
            catchError(() => of(router.createUrlTree(['/login']))),
        );
};
