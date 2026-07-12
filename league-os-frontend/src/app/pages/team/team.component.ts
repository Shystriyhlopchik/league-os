import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Team } from '../../entities/team/model/team.types';

type TeamCard = Pick<Team, 'id' | 'name' | 'slug' | 'logoUrl'>;

const MOCK_TEAMS: TeamCard[] = [
    { id: 1, name: 'Арман', slug: 'arman', logoUrl: '/images/teams/Arman_logo.png' },
    { id: 2, name: 'Легионер', slug: 'legioner', logoUrl: '/images/teams/legioner.png' },
    { id: 3, name: 'Побои', slug: 'poboi', logoUrl: '/images/teams/poboi.svg' },
    { id: 4, name: 'Сарабакасы', slug: 'sarbaki', logoUrl: '/images/teams/sarbaki.svg' },
    { id: 5, name: 'Шоркино', slug: 'shorkino', logoUrl: '/images/teams/shorkino.png' },
    { id: 6, name: 'Сютра', slug: 'sytra', logoUrl: '/images/teams/sytra_logo.svg' },
];

@Component({
  selector: 'app-team',
  imports: [RouterLink],
  templateUrl: './team.component.html',
  styleUrl: './team.component.scss'
})
export class TeamComponent {
    // TODO: Replace with data from TeamsApi when the public endpoint is ready.
    readonly teams = MOCK_TEAMS;

    useFallbackLogo(event: Event): void {
        const image = event.target as HTMLImageElement;
        image.onerror = null;
        image.src = '/images/teams/default-team-logo.png';
    }
}
