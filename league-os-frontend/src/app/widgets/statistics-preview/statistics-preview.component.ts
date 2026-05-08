import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StandingsTableComponent } from '../../entities/standings/ui/standings-table/standings-table.component';
import { CompetitionTabsComponent } from '../../features/select-competition/ui/competition-tabs/competition-tabs.component';
import { StandingRow } from '../../entities/standings/model/standings-row.model';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { CompetitionApi } from '../../entities/competition/api/competition.api';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap, tap } from 'rxjs';
import { Competition } from '../../entities/competition/model/competition.model';

@Component({
    selector: 'app-statistics-preview',
    standalone: true,
    imports: [RouterLink, StandingsTableComponent, CompetitionTabsComponent],
    templateUrl: './statistics-preview.component.html',
    styleUrl: './statistics-preview.component.scss',
})
export class StatisticsPreviewComponent {
    private readonly competitionApi = inject(CompetitionApi);
    private readonly standingsApi = inject(StandingsApi);

    readonly selectedCompetitionId = signal<number | string>(1);

    readonly competitions = toSignal(
        this.competitionApi.getCompetitions().pipe(
            tap((competitions) => {
                if (!this.selectedCompetitionId() && competitions.length) {
                    this.selectedCompetitionId.set(competitions[0].id);
                }
            }),
        ),
        {
            initialValue: [] as Competition[],
        },
    );

    readonly rows = toSignal(
        toObservable(this.selectedCompetitionId).pipe(
            switchMap((competitionId) => {
                if (!competitionId) {
                    return of([] as StandingRow[]);
                }

                return this.standingsApi.getStandingsByCompetition(
                    competitionId,
                );
            }),
        ),
        {
            initialValue: [] as StandingRow[],
        },
    );

    selectCompetition(id: number | string): void {
        this.selectedCompetitionId.set(id);
    }
}
