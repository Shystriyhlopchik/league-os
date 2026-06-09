import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { TokenStorage } from '../lib/storage/token-storage';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const tokenStorage = inject(TokenStorage);
    const token = tokenStorage.getAccessToken();

    if (!token) {
        return next(req);
    }

    const authReq = req.clone({
        setHeaders: {
            Authorization: `Bearer ${token}`,
        },
    });

    return next(authReq);
};
