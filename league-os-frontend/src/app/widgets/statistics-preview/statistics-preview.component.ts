import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StandingsTableComponent } from '../../entities/standings/ui/standings-table/standings-table.component';
import { CompetitionTabsComponent } from '../../features/select-competition/ui/competition-tabs/competition-tabs.component';
import { StandingRow } from '../../entities/standings/model/standings-row.model';

@Component({
    selector: 'app-statistics-preview',
    standalone: true,
    imports: [RouterLink, StandingsTableComponent, CompetitionTabsComponent],
    templateUrl: './statistics-preview.component.html',
    styleUrl: './statistics-preview.component.scss',
})
export class StatisticsPreviewComponent {
    competitions = signal([
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
    ]);

    selectedCompetitionId = signal('arman-fl');

    standings = signal<Record<string, StandingRow[]>>({
        'arman-fl': [
            {
                id: 1,
                teamName: 'Сятра',
                teamLogoUrl: 'images/teams/sytra_logo.svg',
                games: 6,
                points: 10,
                movement: 'up',
            },
            {
                id: 2,
                teamName: 'Побои',
                teamLogoUrl: 'images/teams/poboi.svg',
                games: 6,
                points: 9,
                movement: 'same',
            },
            {
                id: 3,
                teamName: 'Сарбаки',
                teamLogoUrl: 'images/teams/sarbaki.svg',
                games: 6,
                points: 8,
                movement: 'same',
            },
            {
                id: 4,
                teamName: 'Шоркино',
                teamLogoUrl: 'images/teams/shorkino.png',
                games: 6,
                points: 7,
                movement: 'down',
            },
        ],

        fin: [],
    });

    rows = computed(() => {
        return this.standings()[this.selectedCompetitionId()] ?? [];
    });

    selectCompetition(id: string) {
        this.selectedCompetitionId.set(id);

        // тут потом будет API
        // this.loadStandings(id);
    }
}
