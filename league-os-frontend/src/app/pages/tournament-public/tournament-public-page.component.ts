import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TournamentPublicViewComponent } from '../../widgets/tournament-public-view/tournament-public-view.component';

@Component({
    selector: 'app-tournament-public-page',
    imports: [RouterLink, TournamentPublicViewComponent],
    templateUrl: './tournament-public-page.component.html',
    styleUrl: './tournament-public-page.component.scss',
})
export class TournamentPublicPageComponent {
    private readonly route = inject(ActivatedRoute);
    readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;
}
