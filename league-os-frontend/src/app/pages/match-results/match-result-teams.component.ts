import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatchRosterCheckStore } from '../../entities/match-roster/model/match-roster-check.store';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { InfoCardComponent } from '../../shared/ui/info-card/info-card.component';
import {
    ManualMatchEvent,
    ManualMatchEventType,
    MatchRosterApi,
} from '../../entities/match-roster/api/match-roster.api';
import { MatchRosterPlayer } from '../../entities/match-roster/model/match-roster.types';

@Component({
    selector: 'app-match-result-teams',
    imports: [DatePipe, FormsModule, PageHeaderComponent, InfoCardComponent],
    templateUrl: './match-result-teams.component.html',
    styleUrl: './match-result-teams.component.scss',
})
export class MatchResultTeamsComponent {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    readonly store = inject(MatchRosterCheckStore);
    private readonly rosterApi = inject(MatchRosterApi);
    readonly matchId = Number(this.route.snapshot.paramMap.get('matchId'));

    events: ManualMatchEvent[] = [];
    selectedTeamId: number | null = null;
    selectedEventType: ManualMatchEventType | null = null;
    eventMinute: number | null = null;
    selectedHalf: 1 | 2 | null = null;
    selectedPlayerId: number | null = null;
    selectedAssistPlayerId: number | null = null;
    isSavingEvent = false;
    deletingEventId: number | null = null;
    isSigningProtocol = false;
    isTechnicalLossFormVisible = false;
    selectedTechnicalLoserTeamId: number | null = null;
    technicalResultReason = '';
    isSavingTechnicalLoss = false;
    technicalResultError = '';
    eventError = '';

    readonly eventLabels: Record<ManualMatchEventType, string> = {
        goal: 'Гол',
        yellow_card: 'Жёлтая карточка',
        red_card: 'Красная карточка',
        red_ball: 'Красный мяч',
    };

    constructor() {
        this.store.load(this.matchId);
        this.loadEvents();
    }

    goBack(): void {
        this.router.navigate(['/dashboard/match-results']);
    }

    openTeam(teamId: number): void {
        this.router.navigate([
            '/dashboard/match-results',
            this.matchId,
            'teams',
            teamId,
        ]);
    }

    addEvent(): void {
        if (
            !this.selectedTeamId ||
            this.eventMinute === null ||
            this.eventMinute < 0 ||
            !this.selectedHalf ||
            !this.selectedEventType ||
            this.isSavingEvent ||
            (this.selectedEventType !== 'red_ball' && !this.selectedPlayerId)
        ) {
            this.eventError = 'Укажите команду и корректную минуту события';
            return;
        }

        this.isSavingEvent = true;
        this.eventError = '';
        this.rosterApi
            .createManualEvent(this.matchId, {
                teamId: this.selectedTeamId,
                eventType: this.selectedEventType,
                minute: this.eventMinute,
                half: this.selectedHalf,
                playerId: this.selectedPlayerId ?? undefined,
                assistPlayerId:
                    this.selectedEventType === 'goal'
                        ? (this.selectedAssistPlayerId ?? undefined)
                        : undefined,
            })
            .subscribe({
                next: (event) => {
                    this.events = [...this.events, event].sort(
                        (a, b) => a.half - b.half || a.minute - b.minute,
                    );
                    this.isSavingEvent = false;
                    this.resetEventForm();
                },
                error: (error) => {
                    this.eventError =
                        error?.error?.message || 'Не удалось сохранить событие';
                    this.isSavingEvent = false;
                },
            });
    }

    deleteEvent(event: ManualMatchEvent): void {
        if (
            this.isProtocolSigned ||
            this.deletingEventId !== null ||
            !confirm(`Удалить событие на ${event.minute}-й минуте?`)
        ) {
            return;
        }

        this.deletingEventId = event.id;
        this.eventError = '';
        this.rosterApi.cancelManualEvent(this.matchId, event.id).subscribe({
            next: () => {
                this.events = this.events.filter(
                    (item) => item.id !== event.id,
                );
                this.deletingEventId = null;
            },
            error: (error) => {
                this.eventError =
                    error?.error?.message || 'Не удалось удалить событие';
                this.deletingEventId = null;
            },
        });
    }

    getTeamName(teamId: number): string {
        const match = this.store.data()?.match;
        if (match?.homeTeam.id === teamId) return match.homeTeam.name;
        if (match?.awayTeam.id === teamId) return match.awayTeam.name;
        return '';
    }

    get selectedTeamPlayers(): MatchRosterPlayer[] {
        const data = this.store.data();
        if (!data || !this.selectedTeamId) return [];
        return this.selectedTeamId === data.match.homeTeam.id
            ? data.homeRoster
            : data.awayRoster;
    }

    get isProtocolSigned(): boolean {
        return this.store.data()?.match.status === 'finished';
    }

    get homeScore(): number {
        if (this.isProtocolSigned)
            return this.store.data()?.match.homeScore ?? 0;
        const teamId = this.store.data()?.match.homeTeam.id;
        return this.events.filter(
            (event) => event.eventType === 'goal' && event.teamId === teamId,
        ).length;
    }

    get awayScore(): number {
        if (this.isProtocolSigned)
            return this.store.data()?.match.awayScore ?? 0;
        const teamId = this.store.data()?.match.awayTeam.id;
        return this.events.filter(
            (event) => event.eventType === 'goal' && event.teamId === teamId,
        ).length;
    }

    signProtocol(): void {
        if (
            this.isProtocolSigned ||
            this.isSigningProtocol ||
            !confirm(
                'Подписать протокол? После этого редактирование будет невозможно.',
            )
        ) {
            return;
        }

        this.isSigningProtocol = true;
        this.eventError = '';
        this.rosterApi.signManualProtocol(this.matchId).subscribe({
            next: () => {
                this.isSigningProtocol = false;
                this.store.load(this.matchId);
            },
            error: (error) => {
                this.eventError =
                    error?.error?.message || 'Не удалось подписать протокол';
                this.isSigningProtocol = false;
            },
        });
    }

    toggleTechnicalLossForm(): void {
        if (this.isProtocolSigned || this.isSavingTechnicalLoss) return;

        this.isTechnicalLossFormVisible = !this.isTechnicalLossFormVisible;
        this.technicalResultError = '';
        if (!this.isTechnicalLossFormVisible) {
            this.resetTechnicalLossForm();
        }
    }

    assignTechnicalLoss(): void {
        const match = this.store.data()?.match;
        const reason = this.technicalResultReason.trim();
        const loserTeamId = this.selectedTechnicalLoserTeamId;

        if (!match || this.isProtocolSigned || this.isSavingTechnicalLoss) {
            return;
        }

        if (
            loserTeamId !== match.homeTeam.id &&
            loserTeamId !== match.awayTeam.id
        ) {
            this.technicalResultError =
                'Выберите команду, которой засчитывается техническое поражение';
            return;
        }

        if (!reason) {
            this.technicalResultError =
                'Укажите причину технического поражения';
            return;
        }

        if (reason.length > 1000) {
            this.technicalResultError =
                'Причина не должна превышать 1000 символов';
            return;
        }

        const isHomeTeamLoser = loserTeamId === match.homeTeam.id;
        const winnerTeamId = isHomeTeamLoser
            ? match.awayTeam.id
            : match.homeTeam.id;
        const loserTeamName = isHomeTeamLoser
            ? match.homeTeam.name
            : match.awayTeam.name;

        if (
            !confirm(
                `Засчитать команде «${loserTeamName}» техническое поражение? Матч завершится со счётом ${isHomeTeamLoser ? '0:3' : '3:0'}, редактирование будет недоступно.`,
            )
        ) {
            return;
        }

        this.isSavingTechnicalLoss = true;
        this.technicalResultError = '';
        this.rosterApi
            .signTechnicalLoss(this.matchId, {
                resolutionType: 'technical',
                winnerTeamId,
                technicalResultReason: reason,
            })
            .subscribe({
                next: () => {
                    this.isSavingTechnicalLoss = false;
                    this.resetTechnicalLossForm();
                    this.store.load(this.matchId);
                },
                error: (error) => {
                    this.technicalResultError =
                        error?.error?.message ||
                        'Не удалось сохранить техническое поражение';
                    this.isSavingTechnicalLoss = false;
                },
            });
    }

    getPlayerNameById(playerId?: number): string {
        if (!playerId) return '';
        const data = this.store.data();
        const player = [
            ...(data?.homeRoster ?? []),
            ...(data?.awayRoster ?? []),
        ].find((item) => item.id === playerId);
        return player
            ? [player.lastName, player.firstName, player.middleName]
                  .filter(Boolean)
                  .join(' ')
            : `Игрок #${playerId}`;
    }

    onTeamChange(): void {
        this.selectedPlayerId = null;
        this.selectedAssistPlayerId = null;
    }

    onEventTypeChange(): void {
        if (this.selectedEventType !== 'goal') {
            this.selectedAssistPlayerId = null;
        }
        if (this.selectedEventType === 'red_ball') {
            this.selectedPlayerId = null;
        }
    }

    private resetEventForm(): void {
        this.eventMinute = null;
        this.selectedHalf = null;
        this.selectedEventType = null;
        this.selectedTeamId = null;
        this.selectedPlayerId = null;
        this.selectedAssistPlayerId = null;
    }

    private resetTechnicalLossForm(): void {
        this.isTechnicalLossFormVisible = false;
        this.selectedTechnicalLoserTeamId = null;
        this.technicalResultReason = '';
        this.technicalResultError = '';
    }

    private loadEvents(): void {
        this.rosterApi.getManualEvents(this.matchId).subscribe({
            next: (events) => (this.events = events),
            error: () => (this.eventError = 'Не удалось загрузить события'),
        });
    }
}
