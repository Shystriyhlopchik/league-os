import { Routes } from '@angular/router';
import { MainComponent } from './features/main/main.component';

export const routes: Routes = [
    {
        path: '',
        component: MainComponent,
        data: { breadcrumb: 'Главная' },
        children: [
            {
                path: 'organizers',
                loadComponent: () =>
                    import('./features/organizers/organizers.component').then(
                        (m) => m.OrganizersComponent,
                    ),
                data: { breadcrumb: 'О лиге - Наш коллектив' },
            },
            // {
            //     path: 'manifest',
            //     loadComponent: () =>
            //         import('./features/manifest/manifest.component').then(
            //             (m) => m.OrganizersComponent,
            //         ),
            //     data: { breadcrumb: 'О лиге - Наш манифест' },
            // },
        ],
    },
];
