import { inject } from '@angular/core';
import {
    CanActivateFn,
    Router,
} from '@angular/router';
import { SessionStore } from '../entities/user/model/session.store';
import { TokenStorage } from '../shared/lib/storage/token-storage';


export const authGuard: CanActivateFn = () => {
    const sessionStore = inject(SessionStore);
    const tokenStorage = inject(TokenStorage);
    const router = inject(Router);

    if (sessionStore.isAuthenticated()) {
        return true;
    }

    if (tokenStorage.getAccessToken()) {
        return true;
    }

    return router.createUrlTree(['/login']);
};
