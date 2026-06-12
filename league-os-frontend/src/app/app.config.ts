import {
    ApplicationConfig,
    LOCALE_ID,
    provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import localeRu from '@angular/common/locales/ru';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import { authInterceptor } from './shared/api/auth.interceptor';

registerLocaleData(localeRu, 'ru');

export const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideRouter(routes),
        {
            provide: LOCALE_ID,
            useValue: 'ru',
        },
        provideHttpClient(withInterceptors([authInterceptor])),
    ],
};
