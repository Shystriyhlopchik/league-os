import { Component, input } from '@angular/core';
import { StandingRow } from '../../model/standings-row.model';

@Component({
    selector: 'app-standings-table',
    imports: [],
    templateUrl: './standings-table.component.html',
    styleUrl: './standings-table.component.scss',
})
export class StandingsTableComponent {
    readonly rows = input.required<StandingRow[]>();
}
