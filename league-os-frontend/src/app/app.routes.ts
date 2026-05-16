import { Routes } from '@angular/router';
import { MainComponent } from './features/main/main.component';

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
    }
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
