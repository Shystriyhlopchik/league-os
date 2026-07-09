import { computed, inject, Injectable, signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { TeamPlayersApi } from '../../../entities/team-player/api/team-players.api';
import {CreateTeamPlayerDto, TeamPlayer} from '../../../entities/team-player/model/team-player.types';

@Injectable()
export class TeamPlayersDetailStore {
    private readonly teamPlayersApi = inject(TeamPlayersApi);

    readonly players = signal<TeamPlayer[]>([]);
    readonly isLoading = signal(false);
    readonly isCreating = signal(false);
    readonly error = signal<string | null>(null);
    readonly createError = signal<string | null>(null);

    readonly isEmpty = computed(() => {
        return !this.isLoading() && this.players().length === 0;
    });

    loadPlayers(teamId: number): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.teamPlayersApi
            .getByTeam(teamId)
            .pipe(
                tap((players) => {
                    this.players.set(players);
                }),
                catchError(() => {
                    this.error.set('Не удалось загрузить игроков команды');
                    this.players.set([]);

                    return EMPTY;
                }),
                finalize(() => {
                    this.isLoading.set(false);
                }),
            )
            .subscribe();
    }

    createPlayer(
        teamId: number,
        dto: CreateTeamPlayerDto,
        onSuccess?: () => void,
    ): void {
        this.isCreating.set(true);
        this.createError.set(null);

        this.teamPlayersApi
            .create(teamId, dto)
            .pipe(
                tap((createdPlayer) => {
                    this.players.update((players) => [
                        ...players,
                        createdPlayer,
                    ]);

                    onSuccess?.();
                }),
                catchError((error) => {
                    const message =
                        error?.error?.message ||
                        'Не удалось добавить игрока';

                    this.createError.set(message);

                    return EMPTY;
                }),
                finalize(() => {
                    this.isCreating.set(false);
                }),
            )
            .subscribe();
    }

    updatePlayer(
        teamId: number,
        teamPlayerId: number,
        dto: CreateTeamPlayerDto,
        onSuccess?: () => void,
    ): void {
        this.isCreating.set(true);
        this.createError.set(null);

        this.teamPlayersApi
            .update(teamId, teamPlayerId, dto)
            .pipe(
                tap((updatedPlayer) => {
                    this.players.update((players) =>
                        players.map((player) =>
                            player.id === updatedPlayer.id ? updatedPlayer : player,
                        ),
                    );
                    onSuccess?.();
                }),
                catchError((error) => {
                    const message =
                        error?.error?.message ||
                        'Не удалось сохранить изменения игрока';

                    this.createError.set(message);

                    return EMPTY;
                }),
                finalize(() => {
                    this.isCreating.set(false);
                }),
            )
            .subscribe();
    }
}
