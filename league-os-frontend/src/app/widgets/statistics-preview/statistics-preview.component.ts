import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StandingsTableComponent } from '../../entities/standings/ui/standings-table/standings-table.component';
import { CompetitionTabsComponent } from '../../features/select-competition/ui/competition-tabs/competition-tabs.component';
import { StandingRow } from '../../entities/standings/model/standings-row.model';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { CompetitionApi } from '../../entities/competition/api/competition.api';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap, tap } from 'rxjs';
import {TournamentsApi} from '../../entities/tournaments/api/tournaments.api';
import {Tournament} from '../../entities/tournaments/model/tournaments.model';

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
    private readonly tournamentApi = inject(TournamentsApi);

    readonly selectedTournamentId = signal<number | string>(1);

    readonly tournaments = toSignal(
        /* TODO ID сезона будет вставлять по выбору пользователя*/
        this.tournamentApi.getTournamentsSeason(1).pipe(
            tap((tournaments) => {
                if (tournaments.length) {
                    this.selectedTournamentId.set(tournaments[0].id)
                }
            })
        ),
        {
            initialValue: [] as Tournament[],
        },
    )

    readonly rows = toSignal(
        toObservable(this.selectedTournamentId).pipe(
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
        this.selectedTournamentId.set(id);
    }
}
