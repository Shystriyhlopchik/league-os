import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface LeagueTab {
    id: string;
    name: string;
    logoUrl: string;
}

interface TeamStandingRow {
    id: number;
    name: string;
    logoUrl: string;
    games: number;
    points: number;
    status: 'up' | 'same' | 'down';
}

@Component({
    selector: 'app-statistics-preview',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './statistics-preview.component.html',
    styleUrl: './statistics-preview.component.scss',
})
export class StatisticsPreviewComponent {
    selectedLeagueId = 'arman-fl';

    leagues: LeagueTab[] = [
        {
            id: 'arman-fl',
            name: 'Арман ФЛ',
            logoUrl: 'images/icons/logo_arman_liga.png',
        },
        {
            id: 'fin',
            name: 'ФИН',
            logoUrl: 'images/icons/FutboolFederationChuvashii.png',
        },
    ];

    standings: Record<string, TeamStandingRow[]> = {
        'arman-fl': [
            {
                id: 1,
                name: 'Сятра',
                logoUrl: 'images/teams/sytra_logo.svg',
                games: 6,
                points: 10,
                status: 'up',
            },
            {
                id: 2,
                name: 'Побои',
                logoUrl: 'images/teams/poboi.svg',
                games: 6,
                points: 9,
                status: 'same',
            },
            {
                id: 3,
                name: 'Сарбаки',
                logoUrl: 'images/teams/sarbaki.svg',
                games: 6,
                points: 8,
                status: 'same',
            },
            {
                id: 4,
                name: 'Шоркино',
                logoUrl: 'images/teams/shorkino.png',
                games: 6,
                points: 7,
                status: 'down',
            },
        ],

        fin: [],
    };

    get tableRows(): TeamStandingRow[] {
        return this.standings[this.selectedLeagueId] ?? [];
    }

    selectLeague(leagueId: string): void {
        this.selectedLeagueId = leagueId;

        // Позже сюда можно добавить вызов сервиса:
        // this.statisticsService.loadStandings(leagueId).subscribe(...)
    }
}
