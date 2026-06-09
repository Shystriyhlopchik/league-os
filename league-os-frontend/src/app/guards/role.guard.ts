import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../entities/user/model/session.store';

export function roleGuard(roles: string[]): CanActivateFn {
    return () => {
        const sessionStore = inject(SessionStore);
        const router = inject(Router);

        if (sessionStore.hasAnyRole(...roles)) {
            return true;
        }

        return router.createUrlTree(['/dashboard']);
    };
}
