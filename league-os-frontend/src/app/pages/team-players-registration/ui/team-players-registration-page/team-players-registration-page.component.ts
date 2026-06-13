import {Component, inject, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import {TeamPlayersRegistrationStore} from '../../model/team-players-registration.store';

interface TeamRegistrationCard {
    id: number;
    name: string;
    village?: string;
    logoUrl?: string | null;
}

@Component({
    selector: 'app-team-players-registration-page',
    imports: [RouterLink],
    templateUrl: './team-players-registration-page.component.html',
    styleUrl: './team-players-registration-page.component.scss',
    providers: [TeamPlayersRegistrationStore],
})
export class TeamPlayersRegistrationPageComponent implements OnInit{
    readonly store = inject(TeamPlayersRegistrationStore);

    ngOnInit(): void {
        this.store.loadTeams();
    }
}
