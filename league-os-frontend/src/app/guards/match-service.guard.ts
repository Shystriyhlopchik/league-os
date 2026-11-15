import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { SessionStore } from '../entities/user/model/session.store';

// Wait for online authentication or the same-user offline identity. A
// synchronous role check redirects a reloaded protocol before /auth/me returns.
export const matchServiceGuard: CanActivateFn = () => {
    const session = inject(SessionStore);
    const router = inject(Router);
    if (!session.isInitialized() && !session.isLoading()) session.init();
    return toObservable(session.isInitialized).pipe(
        filter(Boolean), take(1),
        map(() => session.hasAnyRole('super_admin', 'admin', 'referee') || session.canManageCommunityTournaments()
            ? true : router.createUrlTree(['/dashboard'])),
    );
};
