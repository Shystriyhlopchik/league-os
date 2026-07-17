import { Routes } from '@angular/router';
import { MainComponent } from './features/main/main.component';
import {authGuard} from './guards/auth.guard';
import {roleGuard} from './guards/role.guard';
import {UserRole} from './entities/user/model/user-role.type';
import {guestGuard} from './guards/guest.guard';
import {matchProtocolLeaveGuard} from './pages/match-protocol/model/match-protocol-leave.guard';
import { tournamentBuilderFeatureGuard } from './guards/tournament-builder-feature.guard';

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
        path: 'team',
        loadComponent: () =>
            import('./pages/team/team.component').then((m) => m.TeamComponent),
    },
    {
        path: 'news/:slug',
        loadComponent: () =>
            import('./pages/news-detail/news-detail.component').then(
                (m) => m.NewsDetailComponent,
            ),
    },
    {
        path: 'tournaments/:tournamentId',
        loadComponent: () =>
            import(
                './pages/tournament-public/tournament-public-page.component'
            ).then((m) => m.TournamentPublicPageComponent),
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
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () =>
            import('./pages/register/ui/register-page/register-page.component').then(
                (m) => m.RegisterPageComponent,
            ),
    },
    {
        path: 'matches/:matchId/protocol',
        loadComponent: () =>
            import('./pages/match-view-protocol/ui/match-view-protocol-page/match-view-protocol-page.component').then(
                (m) => m.MatchViewProtocolPageComponent,
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
            {
                path: 'match-service/:matchId/rosters',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Referee])],
                loadComponent: () =>
                    import('./pages/match-roster-check/ui/match-roster-check-page/match-roster-check-page.component').then(
                        (m) => m.MatchRosterCheckPageComponent,
                    ),
            },
            {
                path: 'match-service/:matchId/protocol',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Referee])],
                canDeactivate: [matchProtocolLeaveGuard],
                loadComponent: () =>
                    import('./pages/match-protocol/ui/match-protocol-page/match-protocol-page.component')
                        .then((m) => m.MatchProtocolPageComponent),
            },
            {
                path: 'team-players',
                canActivate: [authGuard],
                loadComponent: () =>
                    import('./pages/team-players-registration/ui/team-players-registration-page/team-players-registration-page.component').then(
                        (m) => m.TeamPlayersRegistrationPageComponent,
                    ),
            },
            {
                path: 'match-registrations',
                canActivate: [authGuard],
                loadComponent: () =>
                    import('./pages/match-registrations/ui/match-registrations-page/match-registrations-page.component').then(
                        (m) => m.MatchRegistrationsPageComponent,
                    ),
            },
            {
                path: 'player-transfers',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Admin])],
                loadComponent: () =>
                    import('./pages/player-transfers/player-transfers-page.component').then(
                        (m) => m.PlayerTransfersPageComponent,
                    ),
            },
            {
                path: 'match-results',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Admin, UserRole.Referee])],
                loadComponent: () =>
                    import('./pages/match-results/match-results.component').then(
                        (m) => m.MatchResultsComponent,
                    ),
            },
            {
                path: 'match-results/:matchId/teams/:teamId',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Admin, UserRole.Referee])],
                loadComponent: () =>
                    import('./pages/match-registrations/ui/match-registration-detail-page/match-registration-detail-page.component').then(
                        (m) => m.MatchRegistrationDetailPageComponent,
                    ),
            },
            {
                path: 'match-results/:matchId',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Admin, UserRole.Referee])],
                loadComponent: () =>
                    import('./pages/match-results/match-result-teams.component').then(
                        (m) => m.MatchResultTeamsComponent,
                    ),
            },
            {
                path: 'tournaments/new',
                canActivate: [
                    tournamentBuilderFeatureGuard,
                    roleGuard([UserRole.SuperAdmin, UserRole.Admin]),
                ],
                loadComponent: () =>
                    import('./pages/tournament-builder/ui/tournament-builder-page.component').then(
                        (m) => m.TournamentBuilderPageComponent,
                    ),
            },
            {
                path: 'new-news',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Admin])],
                loadComponent: () =>
                    import('./pages/news-management/news-management-page.component').then(
                        (m) => m.NewsManagementPageComponent,
                    ),
            },
            {
                path: 'new-news/new',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Admin])],
                loadComponent: () =>
                    import('./pages/news-editor/news-editor-page.component').then(
                        (m) => m.NewsEditorPageComponent,
                    ),
            },
            {
                path: 'new-news/:newsId/edit',
                canActivate: [roleGuard([UserRole.SuperAdmin, UserRole.Admin])],
                loadComponent: () =>
                    import('./pages/news-editor/news-editor-page.component').then(
                        (m) => m.NewsEditorPageComponent,
                    ),
            },
            {
                path: 'tournaments/:tournamentId/edit',
                canActivate: [
                    tournamentBuilderFeatureGuard,
                    roleGuard([UserRole.SuperAdmin, UserRole.Admin]),
                ],
                loadComponent: () =>
                    import('./pages/tournament-builder/ui/tournament-builder-page.component').then(
                        (m) => m.TournamentBuilderPageComponent,
                    ),
            },
            {
                path: 'match-registrations/:matchId/teams/:teamId',
                canActivate: [authGuard],
                loadComponent: () =>
                    import('./pages/match-registrations/ui/match-registration-detail-page/match-registration-detail-page.component').then(
                        (m) => m.MatchRegistrationDetailPageComponent,
                    ),
            },
            {
                path: 'team-players/:teamId',
                canActivate: [authGuard],
                loadComponent: () =>
                    import('./pages/team-players-registration/ui/team-players-detail-page/team-players-detail-page.component').then(
                        (m) => m.TeamPlayersDetailPageComponent,
                    ),
            },
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
