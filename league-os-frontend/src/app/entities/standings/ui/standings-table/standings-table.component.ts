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
    readonly showReason = input(true);

    qualificationLabel(row: StandingRow): string | null {
        if (row.qualificationStatus === 'qualified') return 'Вышла';
        if (row.qualificationStatus === 'best_placed') {
            return 'Лучшая среди мест';
        }
        if (row.qualificationStatus === 'pending') return 'Ожидает';
        return null;
    }
}
