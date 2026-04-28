import { Component, Input } from '@angular/core';
import { TeamMember } from './team-member.model';
import { NgOptimizedImage } from '@angular/common';

@Component({
    selector: 'app-profile-card',
    imports: [NgOptimizedImage],
    templateUrl: './profile-card.component.html',
    styleUrl: './profile-card.component.scss',
})
export class ProfileCardComponent {
    @Input()
    data!: TeamMember;
}
