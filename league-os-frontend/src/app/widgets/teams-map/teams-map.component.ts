import { Component } from '@angular/core';
import { TEAMS_MAP_MARKERS } from './model/teams-map.data';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-teams-map',
    imports: [RouterLink],
    templateUrl: './teams-map.component.html',
    styleUrl: './teams-map.component.scss',
})
export class TeamsMapComponent {
    readonly teams = TEAMS_MAP_MARKERS;
}
