import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { PlayoffLaunchApi } from './playoff-launch.api';
import {
    PlayoffLaunchPayload,
    PlayoffLaunchState,
    PlayoffStanding,
} from './playoff-launch.types';

interface PairDraft {
    homeTournamentTeamId?: number;
    awayTournamentTeamId?: number;
}

interface ScheduleDraft {
    bracketPosition: string;
    label: string;
    matchDatetime: string;
    venueId?: number;
}

@Component({
    selector: 'app-playoff-launch-page',
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './playoff-launch-page.component.html',
    styleUrl: './playoff-launch-page.component.scss',
})
export class PlayoffLaunchPageComponent {
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly playoffApi = inject(PlayoffLaunchApi);

    readonly state = signal<PlayoffLaunchState | null>(null);
    readonly loading = signal(true);
    readonly processing = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly selectedIds = signal<number[]>([]);
    readonly pairs = signal<PairDraft[]>([{}, {}]);
    readonly schedule = signal<ScheduleDraft[]>([]);

    readonly selectedTeams = computed(() => {
        const selected = new Set(this.selectedIds());
        return this.allTeams().filter((team) =>
            selected.has(team.tournamentTeamId),
        );
    });

    readonly allTeams = computed(() =>
        (this.state()?.groups ?? []).flatMap((group) => group.standings),
    );

    readonly canLaunch = computed(() => {
        const state = this.state();
        if (!state || state.launched || this.processing()) return false;
        const ids = this.selectedIds();
        const paired = this.pairs().flatMap((pair) => [
            pair.homeTournamentTeamId,
            pair.awayTournamentTeamId,
        ]);
        return (
            state.groupStage.allMatchesFinished &&
            state.groupStage.standingsReady &&
            ids.length === state.knockoutStage.bracketSize &&
            paired.every((id): id is number => typeof id === 'number') &&
            new Set(paired).size === ids.length &&
            ids.every((id) => paired.includes(id)) &&
            this.schedule().length ===
                state.knockoutStage.expectedMatches.length &&
            this.schedule().every(
                (match) => match.matchDatetime && match.venueId,
            )
        );
    });

    constructor() {
        this.load();
    }

    isSelected(id: number): boolean {
        return this.selectedIds().includes(id);
    }

    isSuggested(id: number): boolean {
        return this.state()?.suggestedTournamentTeamIds.includes(id) ?? false;
    }

    toggleTeam(id: number): void {
        const current = this.selectedIds();
        if (current.includes(id)) {
            this.selectedIds.set(current.filter((item) => item !== id));
            this.removeInvalidPairTeams();
            return;
        }
        const limit = this.state()?.knockoutStage.bracketSize ?? 4;
        if (current.length >= limit) return;
        this.selectedIds.set([...current, id]);
        if (this.selectedIds().length === limit) this.fillPairs();
    }

    updatePair(
        index: number,
        side: 'homeTournamentTeamId' | 'awayTournamentTeamId',
        value: number | undefined,
    ): void {
        this.pairs.update((pairs) =>
            pairs.map((pair, pairIndex) =>
                pairIndex === index ? { ...pair, [side]: value } : pair,
            ),
        );
    }

    updateSchedule(
        index: number,
        field: 'matchDatetime' | 'venueId',
        value: string | number | undefined,
    ): void {
        this.schedule.update((schedule) =>
            schedule.map((match, matchIndex) =>
                matchIndex === index ? { ...match, [field]: value } : match,
            ),
        );
    }

    fillPairs(): void {
        const ids = this.selectedIds();
        if (ids.length !== 4) return;
        this.pairs.set([
            { homeTournamentTeamId: ids[0], awayTournamentTeamId: ids[3] },
            { homeTournamentTeamId: ids[1], awayTournamentTeamId: ids[2] },
        ]);
    }

    prepare(): void {
        const tournamentId = this.state()?.tournament.id;
        if (!tournamentId || this.processing()) return;
        this.processing.set(true);
        this.clearMessages();
        this.playoffApi.prepare(tournamentId).subscribe({
            next: (state) => {
                this.applyState(state);
                this.notice.set(
                    'Итоговые таблицы пересчитаны. Проверьте команды и пары.',
                );
                this.processing.set(false);
            },
            error: (error) => this.handleError(error),
        });
    }

    launch(): void {
        const state = this.state();
        if (!state || !this.canLaunch()) return;
        const payload: PlayoffLaunchPayload = {
            selectedTournamentTeamIds: this.selectedIds(),
            manualPairs: this.pairs().map((pair) => ({
                homeTournamentTeamId: pair.homeTournamentTeamId as number,
                awayTournamentTeamId: pair.awayTournamentTeamId as number,
            })),
            schedule: this.schedule().map((match) => ({
                bracketPosition: match.bracketPosition,
                matchDatetime: match.matchDatetime,
                venueId: match.venueId as number,
            })),
        };
        this.processing.set(true);
        this.clearMessages();
        this.playoffApi.launch(state.tournament.id, payload).subscribe({
            next: (nextState) => {
                this.applyState(nextState);
                this.notice.set(
                    'Плей-офф запущен, матчи опубликованы в календаре.',
                );
                this.processing.set(false);
            },
            error: (error) => this.handleError(error),
        });
    }

    teamName(id?: number): string {
        if (!id) return 'Не выбрана';
        return (
            this.allTeams().find((team) => team.tournamentTeamId === id)?.team
                .name ?? 'Неизвестная команда'
        );
    }

    private load(): void {
        this.tournamentsApi.getActiveTournament().subscribe({
            next: (tournament) => {
                if (!tournament) {
                    this.loading.set(false);
                    this.error.set('Активный турнир не найден.');
                    return;
                }
                this.playoffApi.getState(tournament.id).subscribe({
                    next: (state) => {
                        this.applyState(state);
                        this.loading.set(false);
                    },
                    error: (error) => this.handleError(error, true),
                });
            },
            error: (error) => this.handleError(error, true),
        });
    }

    private applyState(state: PlayoffLaunchState): void {
        this.state.set(state);
        if (!state.launched && this.selectedIds().length === 0) {
            this.selectedIds.set([...state.suggestedTournamentTeamIds]);
            if (this.selectedIds().length === 4) this.fillPairs();
        }
        if (this.schedule().length === 0) {
            this.schedule.set(
                state.knockoutStage.expectedMatches.map((match) => ({
                    ...match,
                    matchDatetime: '',
                })),
            );
        }
    }

    private removeInvalidPairTeams(): void {
        const selected = new Set(this.selectedIds());
        this.pairs.update((pairs) =>
            pairs.map((pair) => ({
                homeTournamentTeamId:
                    pair.homeTournamentTeamId &&
                    selected.has(pair.homeTournamentTeamId)
                        ? pair.homeTournamentTeamId
                        : undefined,
                awayTournamentTeamId:
                    pair.awayTournamentTeamId &&
                    selected.has(pair.awayTournamentTeamId)
                        ? pair.awayTournamentTeamId
                        : undefined,
            })),
        );
    }

    private clearMessages(): void {
        this.error.set('');
        this.notice.set('');
    }

    private handleError(error: unknown, finishLoading = false): void {
        const response = error as HttpErrorResponse;
        const message = response.error?.message;
        this.error.set(
            Array.isArray(message)
                ? message.join('. ')
                : message ||
                      'Не удалось выполнить действие. Попробуйте ещё раз.',
        );
        this.processing.set(false);
        if (finishLoading) this.loading.set(false);
    }
}
