import { computed, inject, Injectable, signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { TeamsApi } from '../../../entities/team/api/teams.api';
import { Team } from '../../../entities/team/model/team.types';
import { SessionStore } from '../../../entities/user/model/session.store';
import { UserRole } from '../../../entities/user/model/user-role.type';

@Injectable()
export class TeamPlayersRegistrationStore {
    private readonly teamsApi = inject(TeamsApi);
    private readonly sessionStore = inject(SessionStore);

    private readonly allTeams = signal<Team[]>([]);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly teams = computed(() => {
        return this.filterTeamsForCurrentUser(this.allTeams());
    });

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
                    this.allTeams.set(teams);
                }),
                catchError(() => {
                    this.error.set('Не удалось загрузить команды');
                    this.allTeams.set([]);

                    return EMPTY;
                }),
                finalize(() => {
                    this.isLoading.set(false);
                }),
            )
            .subscribe();
    }

    private filterTeamsForCurrentUser(teams: Team[]): Team[] {
        if (
            this.sessionStore.hasAnyRole(
                UserRole.Admin,
                UserRole.SuperAdmin,
            )
        ) {
            return teams;
        }

        const manageableTeamIds = new Set(
            this.sessionStore.user()?.manageableTeamIds ?? [],
        );

        return teams.filter((team) => manageableTeamIds.has(team.id));
    }
}
