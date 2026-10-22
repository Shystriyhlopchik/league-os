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
    readonly isCorrectionMode = this.router.url.startsWith(
        '/dashboard/editing-protocol/',
    );
    readonly pageTitle = this.isCorrectionMode
        ? 'Редактирование протокола'
        : 'Формирование заявок';
    readonly pageDescription = this.isCorrectionMode
        ? 'Скорректируйте участников или события завершённого матча'
        : 'Выберите команду, для которой необходимо сформировать заявку';

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
    isPenaltyShootoutFormVisible = false;
    homePenaltyScore: number | null = null;
    awayPenaltyScore: number | null = null;
    homePenaltyKicksTaken: number | null = null;
    awayPenaltyKicksTaken: number | null = null;
    penaltyShootoutError = '';
    extraHomeScore = 0;
    extraAwayScore = 0;
    eventError = '';

    readonly eventLabels: Record<ManualMatchEventType, string> = {
        goal: 'Гол',
        own_goal: 'Автогол',
        penalty_goal: 'Гол с пенальти',
        penalty_missed: 'Незабитый пенальти',
        yellow_card: 'Жёлтая карточка',
        second_yellow_card: 'Вторая жёлтая карточка',
        red_card: 'Красная карточка',
        red_ball: 'Красный мяч',
    };

    constructor() {
        this.store.load(this.matchId);
        this.loadEvents();
    }

    goBack(): void {
        this.router.navigate([
            this.isCorrectionMode
                ? '/dashboard/editing-protocol'
                : '/dashboard/match-results',
        ]);
    }

    openTeam(teamId: number): void {
        this.router.navigate([
            this.isCorrectionMode
                ? '/dashboard/editing-protocol'
                : '/dashboard/match-results',
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
        const dto = {
            teamId: this.selectedTeamId,
            eventType: this.selectedEventType,
            minute: this.eventMinute,
            half: this.selectedHalf,
            playerId: this.selectedPlayerId ?? undefined,
            assistPlayerId:
                this.selectedEventType === 'goal'
                    ? (this.selectedAssistPlayerId ?? undefined)
                    : undefined,
        };
        const request = this.isCorrectionMode
            ? this.rosterApi.createFinishedMatchEvent(this.matchId, dto)
            : this.rosterApi.createManualEvent(this.matchId, dto);

        request.subscribe({
            next: (event) => {
                this.events = [...this.events, event].sort(
                    (a, b) => a.half - b.half || a.minute - b.minute,
                );
                this.isSavingEvent = false;
                this.resetPenaltyShootoutForm();
                this.resetEventForm();
                if (this.isCorrectionMode) {
                    this.store.load(this.matchId);
                }
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
            !this.canEditProtocol ||
            this.deletingEventId !== null ||
            !confirm(`Удалить событие на ${event.minute}-й минуте?`)
        ) {
            return;
        }

        this.deletingEventId = event.id;
        this.eventError = '';
        const request = this.isCorrectionMode
            ? this.rosterApi.cancelFinishedMatchEvent(this.matchId, event.id)
            : this.rosterApi.cancelManualEvent(this.matchId, event.id);

        request.subscribe({
            next: () => {
                this.events = this.events.filter(
                    (item) => item.id !== event.id,
                );
                this.deletingEventId = null;
                this.resetPenaltyShootoutForm();
                if (this.isCorrectionMode) {
                    this.store.load(this.matchId);
                }
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

    get canEditProtocol(): boolean {
        return this.isCorrectionMode || !this.isProtocolSigned;
    }

    get requiresExtraTime(): boolean {
        const match = this.store.data()?.match;
        return (
            !!match?.extraTimeEnabled &&
            this.homeScore + (match.knockoutTie?.previousScore?.home ?? 0) ===
                this.awayScore + (match.knockoutTie?.previousScore?.away ?? 0)
        );
    }

    get requiresPenaltyShootout(): boolean {
        const match = this.store.data()?.match;
        return Boolean(
            match?.penaltyShootout &&
                (!match.knockoutTie ||
                    (match.knockoutTie.leg === 2 &&
                        match.knockoutTie.firstLegOfficial)) &&
                this.homeScore +
                    (match.knockoutTie?.previousScore?.home ?? 0) +
                    (this.requiresExtraTime ? this.extraHomeScore : 0) ===
                    this.awayScore +
                        (match.knockoutTie?.previousScore?.away ?? 0) +
                        (this.requiresExtraTime ? this.extraAwayScore : 0),
        );
    }

    get homeScore(): number {
        if (this.isProtocolSigned && !this.isCorrectionMode)
            return this.store.data()?.match.homeScore ?? 0;
        const match = this.store.data()?.match;
        if (!match) return 0;

        return this.events
            .filter(
                (event) =>
                    ((event.eventType === 'goal' ||
                        event.eventType === 'penalty_goal') &&
                        event.teamId === match.homeTeam.id) ||
                    (event.eventType === 'own_goal' &&
                        event.teamId === match.awayTeam.id),
            )
            .reduce((total, event) => total + (event.goalValue || 1), 0);
    }

    get awayScore(): number {
        if (this.isProtocolSigned && !this.isCorrectionMode)
            return this.store.data()?.match.awayScore ?? 0;
        const match = this.store.data()?.match;
        if (!match) return 0;

        return this.events
            .filter(
                (event) =>
                    ((event.eventType === 'goal' ||
                        event.eventType === 'penalty_goal') &&
                        event.teamId === match.awayTeam.id) ||
                    (event.eventType === 'own_goal' &&
                        event.teamId === match.homeTeam.id),
            )
            .reduce((total, event) => total + (event.goalValue || 1), 0);
    }

    signProtocol(): void {
        if (this.requiresPenaltyShootout) {
            this.showPenaltyShootoutForm();
            return;
        }

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
        this.rosterApi
            .signManualProtocol(
                this.matchId,
                this.requiresExtraTime
                    ? {
                          extraTime: {
                              home: this.extraHomeScore,
                              away: this.extraAwayScore,
                          },
                      }
                    : {},
            )
            .subscribe({
                next: () => {
                    this.isSigningProtocol = false;
                    this.store.load(this.matchId);
                },
                error: (error) => {
                    this.eventError =
                        error?.error?.message ||
                        'Не удалось подписать протокол';
                    this.isSigningProtocol = false;
                },
            });
    }

    togglePenaltyShootoutForm(): void {
        if (this.isProtocolSigned || this.isSigningProtocol) return;

        if (this.isPenaltyShootoutFormVisible) {
            this.resetPenaltyShootoutForm();
            return;
        }

        this.showPenaltyShootoutForm();
    }

    savePenaltyShootout(): void {
        const match = this.store.data()?.match;
        if (!match || !this.requiresPenaltyShootout || this.isSigningProtocol) {
            return;
        }

        const penalties = {
            home: this.homePenaltyScore,
            away: this.awayPenaltyScore,
            homeKicksTaken: this.homePenaltyKicksTaken,
            awayKicksTaken: this.awayPenaltyKicksTaken,
        };
        const validationError = this.validatePenaltyShootout(penalties);
        if (validationError) {
            this.penaltyShootoutError = validationError;
            return;
        }

        if (
            !confirm(
                `Подписать протокол? Основной счёт останется ${this.homeScore}:${this.awayScore}, серия пенальти — ${penalties.home}:${penalties.away}.`,
            )
        ) {
            return;
        }

        this.isSigningProtocol = true;
        this.penaltyShootoutError = '';
        this.rosterApi
            .signManualProtocol(this.matchId, {
                resolutionType: 'penalties',
                ...(this.requiresExtraTime
                    ? {
                          extraTime: {
                              home: this.extraHomeScore,
                              away: this.extraAwayScore,
                          },
                      }
                    : {}),
                penalties: {
                    home: penalties.home!,
                    away: penalties.away!,
                    homeKicksTaken: penalties.homeKicksTaken!,
                    awayKicksTaken: penalties.awayKicksTaken!,
                },
            })
            .subscribe({
                next: () => {
                    this.isSigningProtocol = false;
                    this.resetPenaltyShootoutForm();
                    this.store.load(this.matchId);
                },
                error: (error) => {
                    this.penaltyShootoutError =
                        error?.error?.message ||
                        'Не удалось сохранить серию пенальти';
                    this.isSigningProtocol = false;
                },
            });
    }

    toggleTechnicalLossForm(): void {
        if (this.isProtocolSigned || this.isSavingTechnicalLoss) return;

        this.isTechnicalLossFormVisible = !this.isTechnicalLossFormVisible;
        this.technicalResultError = '';
        if (this.isTechnicalLossFormVisible) {
            this.resetPenaltyShootoutForm();
        }
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
                `Засчитать команде «${loserTeamName}» техническое поражение? Матч завершится со счётом ${isHomeTeamLoser ? '0:5' : '5:0'}, редактирование будет недоступно.`,
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

    private showPenaltyShootoutForm(): void {
        if (!this.requiresPenaltyShootout) return;

        this.resetTechnicalLossForm();
        this.isPenaltyShootoutFormVisible = true;
        this.penaltyShootoutError = '';
        const initialKicks =
            this.store.data()?.match.penaltyShootout?.initialKicksPerTeam ?? 5;
        this.homePenaltyKicksTaken ??= initialKicks;
        this.awayPenaltyKicksTaken ??= initialKicks;
    }

    private resetPenaltyShootoutForm(): void {
        this.isPenaltyShootoutFormVisible = false;
        this.homePenaltyScore = null;
        this.awayPenaltyScore = null;
        this.homePenaltyKicksTaken = null;
        this.awayPenaltyKicksTaken = null;
        this.penaltyShootoutError = '';
    }

    private validatePenaltyShootout(penalties: {
        home: number | null;
        away: number | null;
        homeKicksTaken: number | null;
        awayKicksTaken: number | null;
    }): string | null {
        const values = [
            penalties.home,
            penalties.away,
            penalties.homeKicksTaken,
            penalties.awayKicksTaken,
        ];
        if (
            values.some(
                (value) =>
                    value === null ||
                    !Number.isInteger(value) ||
                    (value as number) < 0,
            )
        ) {
            return 'Укажите количество голов и выполненных ударов целыми неотрицательными числами';
        }

        const home = penalties.home!;
        const away = penalties.away!;
        const homeKicks = penalties.homeKicksTaken!;
        const awayKicks = penalties.awayKicksTaken!;
        if (home > homeKicks || away > awayKicks) {
            return 'Количество забитых пенальти не может превышать количество ударов';
        }
        if (Math.abs(homeKicks - awayKicks) > 1) {
            return 'Количество выполненных командами ударов может отличаться не более чем на один';
        }
        if (home === away) {
            return 'Завершённая серия пенальти должна определить победителя';
        }

        const initialKicks =
            this.store.data()?.match.penaltyShootout?.initialKicksPerTeam ?? 5;
        const homeClinched =
            home > away + Math.max(initialKicks - awayKicks, 0);
        const awayClinched =
            away > home + Math.max(initialKicks - homeKicks, 0);
        if (
            (homeKicks < initialKicks || awayKicks < initialKicks) &&
            !homeClinched &&
            !awayClinched
        ) {
            return 'Начальная серия может завершиться досрочно только после определения победителя';
        }
        if (
            (homeKicks > initialKicks || awayKicks > initialKicks) &&
            (homeKicks !== awayKicks || Math.abs(home - away) !== 1)
        ) {
            return 'В серии до первого промаха команды должны выполнить одинаковое число ударов, а разница должна составлять один гол';
        }

        return null;
    }

    private loadEvents(): void {
        const request = this.isCorrectionMode
            ? this.rosterApi.getFinishedMatchEvents(this.matchId)
            : this.rosterApi.getManualEvents(this.matchId);

        request.subscribe({
            next: (events) => (this.events = events),
            error: () => (this.eventError = 'Не удалось загрузить события'),
        });
    }
}
