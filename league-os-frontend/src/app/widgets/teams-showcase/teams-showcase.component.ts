import { Component } from '@angular/core';
import {RouterLink} from '@angular/router';

@Component({
    selector: 'app-teams-showcase',
    imports: [RouterLink],
    templateUrl: './teams-showcase.component.html',
    styleUrl: './teams-showcase.component.scss',
})
export class TeamsShowcaseComponent {
    teams = [
        {
            name: 'Шоркино',
            logo: 'images/teams/shorkino_name.png',
            small: true,
        },
        {
            name: 'Сятракасы',
            logo: 'images/teams/sytra_logo_name.svg',
            small: false,
        },
        {
            name: 'Сарбаки',
            logo: 'images/teams/sarbaki_name.svg',
            small: false,
        },
        { name: 'Побои', logo: 'images/teams/poboi_name.svg', small: false },
    ];
}
