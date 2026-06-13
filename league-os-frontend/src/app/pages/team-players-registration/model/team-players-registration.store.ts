import { computed, inject, Injectable, signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { TeamsApi } from '../../../entities/team/api/teams.api';
import { Team } from '../../../entities/team/model/team.types';

@Injectable()
export class TeamPlayersRegistrationStore {
    private readonly teamsApi = inject(TeamsApi);

    readonly teams = signal<Team[]>([]);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly isEmpty = computed(() => {
        return !this.isLoading() && this.teams().length === 0;
    });

    loadTeams(): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.teamsApi
            .getTeams()
            .pipe(
                tap((teams) => {
                    this.teams.set(teams);
                }),
                catchError(() => {
                    this.error.set('Не удалось загрузить команды');
                    this.teams.set([]);

                    return EMPTY;
                }),
                finalize(() => {
                    this.isLoading.set(false);
                }),
            )
            .subscribe();
    }
}
