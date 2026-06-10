import { computed, inject, Injectable, signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { MatchRosterApi } from '../api/match-roster.api';
import { MatchRosterCheck } from './match-roster.types';

@Injectable({ providedIn: 'root' })
export class MatchRosterCheckStore {
    private readonly api = inject(MatchRosterApi);

    readonly data = signal<MatchRosterCheck | null>(null);
    readonly selectedTeamId = signal<number | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);
    readonly isApproving = signal(false);

    readonly selectedRoster = computed(() => {
        const data = this.data();
        const selectedTeamId = this.selectedTeamId();

        if (!data || !selectedTeamId) {
            return [];
        }

        if (selectedTeamId === data.match.homeTeam.id) {
            return data.homeRoster;
        }

        return data.awayRoster;
    });

    readonly selectedTeamApproved = computed(() => {
        const data = this.data();
        const selectedTeamId = this.selectedTeamId();

        if (!data || !selectedTeamId) {
            return false;
        }

        if (selectedTeamId === data.match.homeTeam.id) {
            return data.match.homeTeam.rosterApproved;
        }

        if (selectedTeamId === data.match.awayTeam.id) {
            return data.match.awayTeam.rosterApproved;
        }

        return false;
    });

    readonly canGoToMatch = computed(() => {
        const data = this.data();

        if (!data) {
            return false;
        }

        return (
            data.match.homeTeam.rosterApproved &&
            data.match.awayTeam.rosterApproved
        );
    });

    load(matchId: number): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.api
            .getRosterCheck(matchId)
            .pipe(
                tap((data) => {
                    this.data.set(data);
                    this.selectedTeamId.set(data.match.homeTeam.id);
                }),
                catchError(() => {
                    this.error.set('Не удалось загрузить составы');
                    this.data.set(null);

                    return EMPTY;
                }),
                finalize(() => {
                    this.isLoading.set(false);
                }),
            )
            .subscribe();
    }

    selectTeam(teamId: number): void {
        this.selectedTeamId.set(teamId);
    }

    approveSelectedRoster(matchId: number): void {
        const teamId = this.selectedTeamId();

        if (!teamId || this.isApproving()) {
            return;
        }

        this.isApproving.set(true);
        this.error.set(null);

        this.api
            .approveRoster(matchId, teamId)
            .pipe(
                tap((data) => {
                    this.data.set(data);
                }),
                catchError(() => {
                    this.error.set('Не удалось утвердить состав');

                    return EMPTY;
                }),
                finalize(() => {
                    this.isApproving.set(false);
                }),
            )
            .subscribe();
    }
}
