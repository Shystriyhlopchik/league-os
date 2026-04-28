import { Component } from '@angular/core';
import { ProfileCardComponent } from './components/profile-card/profile-card.component';
import { TeamMember } from './components/profile-card/team-member.model';
import { OrganizersService } from './sevices/organizers.service';
import { AsyncPipe } from '@angular/common';

@Component({
    selector: 'app-organizers',
    imports: [ProfileCardComponent, AsyncPipe],
    templateUrl: './organizers.component.html',
    styleUrl: './organizers.component.scss',
})
export class OrganizersComponent {
    organizers$ = this.organizersService.team$;

    constructor(private organizersService: OrganizersService) {}
}
