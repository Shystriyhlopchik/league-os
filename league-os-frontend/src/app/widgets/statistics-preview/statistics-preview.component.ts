import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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

    readonly seasonId = input.required<number>();
    readonly initialTournamentId = input.required<number>();
    readonly selectedTournamentId = signal<number | string | null>(null);
    readonly tournaments = signal<Tournament[]>([]);

    constructor() {
        effect((onCleanup) => {
            const seasonId = this.seasonId();
            const initialTournamentId = this.initialTournamentId();
            const subscription = this.tournamentApi
                .getTournamentsSeason(seasonId)
                .subscribe({
                    next: (tournaments) => {
                        this.tournaments.set(tournaments);
                        const initialTournament = tournaments.find(
                            (tournament) =>
                                tournament.id === initialTournamentId,
                        );
                        this.selectedTournamentId.set(
                            initialTournament?.id ??
                                tournaments[0]?.id ??
                                null,
                        );
                    },
                    error: () => {
                        this.tournaments.set([]);
                        this.selectedTournamentId.set(null);
                    },
                });

            onCleanup(() => subscription.unsubscribe());
        });
    }

    selectCompetition(id: number | string): void {
        this.selectedTournamentId.set(id);
    }
}
