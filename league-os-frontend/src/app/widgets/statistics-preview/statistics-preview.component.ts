import {
    Component,
    computed,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { PublicTournamentView } from '../../entities/standings/model/public-tournament-view.model';
import { SectionTitleComponent } from '../../shared/ui/section-title/section-title.component';
import { SlantedLinkComponent } from '../../shared/ui/slanted-link/slanted-link.component';
import { StandingsTableComponent } from '../../entities/standings/ui/standings-table/standings-table.component';

@Component({
    selector: 'app-statistics-preview',
    standalone: true,
    imports: [
        RouterLink,
        SectionTitleComponent,
        SlantedLinkComponent,
        StandingsTableComponent,
    ],
    templateUrl: './statistics-preview.component.html',
    styleUrl: './statistics-preview.component.scss',
})
export class StatisticsPreviewComponent {
    private readonly standingsApi = inject(StandingsApi);

    readonly tournamentId = input.required<number>();
    readonly groupId = input<number | null>(null);
    readonly tournamentView = signal<PublicTournamentView | null>(null);

    readonly rows = computed(() => {
        const tournamentView = this.tournamentView();
        const groupId = this.groupId();
        if (!tournamentView || groupId === null) return [];

        for (const stage of tournamentView.stages) {
            const group = stage.groups.find(
                (candidate) => candidate.id === groupId,
            );
            if (group) return group.standings;
        }

        return [];
    });

    constructor() {
        effect((onCleanup) => {
            const tournamentId = this.tournamentId();
            this.tournamentView.set(null);

            const subscription = this.standingsApi
                .getPublicTournamentView(tournamentId)
                .subscribe({
                    next: (view) => this.tournamentView.set(view),
                    error: () => this.tournamentView.set(null),
                });

            onCleanup(() => subscription.unsubscribe());
        });
    }
}
