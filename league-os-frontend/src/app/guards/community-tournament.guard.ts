import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { TournamentBuilderApi } from '../pages/tournament-builder/api/tournament-builder.api';
import { AuthApi } from '../entities/user/api/auth.api';
import { SessionStore } from '../entities/user/model/session.store';

export const communityTournamentGuard: CanActivateFn = (route) => {
    const router = inject(Router);
    const store = inject(SessionStore);
    const tournaments = inject(TournamentBuilderApi);
    return inject(AuthApi)
        .me()
        .pipe(
            switchMap((user) => {
                store.updateUser(user);
                if (store.canManageCommunityTournaments()) return of(true);
                const id = Number(
                    route.paramMap.get('tournamentId') ??
                        route.queryParamMap.get('tournamentId'),
                );
                return id
                    ? tournaments.loadBuilder(id).pipe(
                          map(() => true),
                          catchError(() =>
                              of(
                                  router.createUrlTree([
                                      '/dashboard/tournament-applications',
                                  ]),
                              ),
                          ),
                      )
                    : of(router.createUrlTree(['/dashboard/communities']));
            }),
            catchError(() => of(router.createUrlTree(['/login']))),
        );
};
