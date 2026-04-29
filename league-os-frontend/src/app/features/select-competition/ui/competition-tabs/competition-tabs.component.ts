import {Component, input, output} from '@angular/core';
import {Competition} from '../../../../entities/competition/model/competition.model';

@Component({
  selector: 'app-competition-tabs',
  imports: [],
  templateUrl: './competition-tabs.component.html',
  styleUrl: './competition-tabs.component.scss'
})
export class CompetitionTabsComponent {
    readonly competitions = input.required<Competition[]>();
    readonly selectedId = input.required<string>();

    readonly selected = output<string>();

    selectCompetition(id: string): void {
        this.selected.emit(id);
    }
}
