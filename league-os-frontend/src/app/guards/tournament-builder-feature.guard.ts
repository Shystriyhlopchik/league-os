import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { FeatureFlagsApi } from '../shared/api/feature-flags.api';

export const tournamentBuilderFeatureGuard: CanActivateFn = () => {
    const flags = inject(FeatureFlagsApi);
    const router = inject(Router);
    return flags
        .get()
        .pipe(
            map((value) =>
                value.tournamentBuilder
                    ? true
                    : router.createUrlTree(['/dashboard']),
            ),
        );
};
