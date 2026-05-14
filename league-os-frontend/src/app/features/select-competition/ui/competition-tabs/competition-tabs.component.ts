import { Component, input, output } from '@angular/core';
import {Tournament, TournamentType} from '../../../../entities/tournaments/model/tournaments.model';

@Component({
    selector: 'app-competition-tabs',
    imports: [],
    templateUrl: './competition-tabs.component.html',
    styleUrl: './competition-tabs.component.scss',
})
export class CompetitionTabsComponent {
    protected readonly TournamentType = TournamentType;
    readonly tournaments = input.required<Tournament[]>();
    readonly selectedId = input.required<number | string>();

    readonly selected = output<number>();

    selectCompetition(id: number): void {
        this.selected.emit(id);
    }
}
