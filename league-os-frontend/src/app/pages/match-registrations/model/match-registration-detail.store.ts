import { computed, inject, Injectable, signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';

import { MatchServiceApi } from '../../../entities/match-service/api/match-service.api';
import { MatchRegistration } from '../../../entities/match-service/model/match-service.types';

@Injectable()
export class MatchRegistrationDetailStore {
    private readonly api = inject(MatchServiceApi);

    readonly registration = signal<MatchRegistration | null>(null);
    readonly selectedIds = signal<Set<number>>(new Set());
    readonly isLoading = signal(false);
    readonly isSaving = signal(false);
    readonly isApproving = signal(false);
    readonly isDirty = signal(false);
    readonly error = signal<string | null>(null);
    readonly message = signal<string | null>(null);
    readonly selectedCount = computed(() => this.selectedIds().size);

    load(matchId: number, teamId: number, correctionMode = false): void {
        this.isLoading.set(true);
        this.error.set(null);

        const request = correctionMode
            ? this.api.getFinishedMatchRegistration(matchId, teamId)
            : this.api.getMatchRegistration(matchId, teamId);

        request
            .pipe(
                tap((registration) => this.applyRegistration(registration)),
                catchError((error) => {
                    this.error.set(
                        error?.error?.message || 'Не удалось загрузить заявку',
                    );

                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
            )
            .subscribe();
    }

    toggle(teamPlayerId: number, checked: boolean): void {
        const selectedIds = new Set(this.selectedIds());

        checked ? selectedIds.add(teamPlayerId) : selectedIds.delete(teamPlayerId);
        this.selectedIds.set(selectedIds);
        this.isDirty.set(true);
        this.message.set(null);
    }

    save(matchId: number, teamId: number, correctionMode = false): void {
        this.isSaving.set(true);
        this.error.set(null);
        this.message.set(null);

        const request = correctionMode
            ? this.api.saveFinishedMatchRegistration(
                  matchId,
                  teamId,
                  [...this.selectedIds()],
              )
            : this.api.saveMatchRegistration(matchId, teamId, [
                  ...this.selectedIds(),
              ]);

        request
            .pipe(
                tap((registration) => {
                    this.applyRegistration(registration);
                    this.message.set(
                        correctionMode
                            ? 'Протокол участников сохранён'
                            : 'Заявка сохранена',
                    );
                }),
                catchError((error) => {
                    this.error.set(
                        error?.error?.message || 'Не удалось сохранить заявку',
                    );

                    return EMPTY;
                }),
                finalize(() => this.isSaving.set(false)),
            )
            .subscribe();
    }

    approve(matchId: number, teamId: number): void {
        this.isApproving.set(true);
        this.error.set(null);
        this.message.set(null);

        this.api
            .saveMatchRegistration(matchId, teamId, [...this.selectedIds()])
            .pipe(
                switchMap(() =>
                    this.api.approveMatchRegistration(matchId, teamId),
                ),
                tap((registration) => {
                    this.applyRegistration(registration);
                    this.message.set('Заявка утверждена и отправлена судье');
                }),
                catchError((error) => {
                    this.error.set(
                        error?.error?.message || 'Не удалось утвердить заявку',
                    );

                    return EMPTY;
                }),
                finalize(() => this.isApproving.set(false)),
            )
            .subscribe();
    }

    private applyRegistration(registration: MatchRegistration): void {
        this.registration.set(registration);
        this.selectedIds.set(
            new Set(
                registration.players
                    .filter((player) => player.isSelected)
                    .map((player) => player.teamPlayerId),
            ),
        );
        this.isDirty.set(false);
    }
}
