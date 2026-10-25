import { Component, computed, input } from '@angular/core';
import { StandingRow } from '../../model/standings-row.model';

@Component({
    selector: 'app-standings-table',
    imports: [],
    templateUrl: './standings-table.component.html',
    styleUrl: './standings-table.component.scss',
})
export class StandingsTableComponent {
    DEFAULT_IMAGE = 'brand/logos/mark_white.svg';

    readonly sourceRows = input.required<readonly StandingRow[]>({
        alias: 'rows',
    });

    readonly rows = computed(() =>
        [...this.sourceRows()].sort(
            (left, right) =>
                left.position - right.position || left.team.id - right.team.id,
        ),
    );
}
