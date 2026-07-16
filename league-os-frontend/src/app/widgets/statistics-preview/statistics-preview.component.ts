import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { tap } from 'rxjs';
import { CompetitionTabsComponent } from '../../features/select-competition/ui/competition-tabs/competition-tabs.component';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { Tournament } from '../../entities/tournaments/model/tournaments.model';
import { SectionTitleComponent } from '../../shared/ui/section-title/section-title.component';
import { SlantedLinkComponent } from '../../shared/ui/slanted-link/slanted-link.component';
import { TournamentPublicViewComponent } from '../tournament-public-view/tournament-public-view.component';

@Component({
    selector: 'app-statistics-preview',
    standalone: true,
    imports: [
        RouterLink,
        CompetitionTabsComponent,
        SectionTitleComponent,
        SlantedLinkComponent,
        TournamentPublicViewComponent,
    ],
    templateUrl: './statistics-preview.component.html',
    styleUrl: './statistics-preview.component.scss',
})
export class StatisticsPreviewComponent {
    private readonly tournamentApi = inject(TournamentsApi);

    readonly selectedTournamentId = signal<number | string>(1);
    readonly tournaments = toSignal(
        this.tournamentApi.getTournamentsSeason(1).pipe(
            tap((tournaments) => {
                if (tournaments.length) {
                    this.selectedTournamentId.set(tournaments[0].id);
                }
            }),
        ),
        { initialValue: [] as Tournament[] },
    );

    selectCompetition(id: number | string): void {
        this.selectedTournamentId.set(id);
    }
}
