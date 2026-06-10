import { Routes } from '@angular/router';
import { MainComponent } from './features/main/main.component';
import {authGuard} from './guards/auth.guard';
import {roleGuard} from './guards/role.guard';
import {UserRole} from './entities/user/model/user-role.type';
import {guestGuard} from './guards/guest.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./pages/home/home.component').then((m) => m.HomeComponent),
    },
    {
        path: 'news',
        loadComponent: () =>
            import('./pages/news-page/news-page.component').then(
                (m) => m.NewsPageComponent,
            ),
    },
    {
        path: 'news/:slug',
        loadComponent: () =>
            import('./pages/news-detail/news-detail.component').then(
                (m) => m.NewsDetailComponent,
            ),
    },
    {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () =>
            import('./pages/login/ui/login-page/login-page.component').then(
                (m) => m.LoginPageComponent,
            ),
    },
    {
        path: 'dashboard',
        canActivate: [authGuard],
        children: [
            {
                path: '',
                loadComponent: () =>
                    import('./pages/dashboard/ui/dashboard-page/dashboard-page.component').then(
                        (m) => m.DashboardPageComponent,
                    ),
            },
            {
                path: 'match-service',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Referee])],
                loadComponent: () =>
                    import('./pages/match-service/ui/match-service-page/match-service-page.component').then(
                        (m) => m.MatchServicePageComponent,
                    ),
            },
            // {
            //     path: 'match-service/:matchId/rosters',
            //     canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Referee])],
            //     loadComponent: () =>
            //         import('./pages/match-roster-check/ui/match-roster-check-page/match-roster-check-page.component').then(
            //             (m) => m.MatchRosterCheckPageComponent,
            //         ),
            // },
        ],
    },
    // {
    //     path: 'admin/referees',
    //     canActivate: [
    //         authGuard,
    //         roleGuard([UserRole.ADMIN]),
    //     ],
    //     loadComponent: () =>
    //         import('./pages/admin-referees/ui/admin-referees-page.component').then(
    //             (m) => m.AdminRefereesPageComponent,
    //         ),
    // },
    //
    // {
    //     path: 'referee/matches',
    //     canActivate: [
    //         authGuard,
    //         roleGuard([UserRole.REFEREE, UserRole.ADMIN]),
    //     ],
    //     loadComponent: () =>
    //         import('./pages/referee-matches/ui/referee-matches-page.component').then(
    //             (m) => m.RefereeMatchesPageComponent,
    //         ),
    // },
    // {
    //     path: '',
    //     component: MainComponent,
    //     data: { breadcrumb: 'Главная' },
    //     children: [
    //         {
    //             path: 'organizers',
    //             loadComponent: () =>
    //                 import('./features/organizers/organizers.component').then(
    //                     (m) => m.OrganizersComponent,
    //                 ),
    //             data: { breadcrumb: 'О лиге - Наш коллектив' },
    //         },
    //         // {
    //         //     path: 'manifest',
    //         //     loadComponent: () =>
    //         //         import('./features/manifest/manifest.component').then(
    //         //             (m) => m.OrganizersComponent,
    //         //         ),
    //         //     data: { breadcrumb: 'О лиге - Наш манифест' },
    //         // },
    //     ],
    // },
];
