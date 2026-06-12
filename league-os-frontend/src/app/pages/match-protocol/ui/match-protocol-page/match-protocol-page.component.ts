import {
    Component,
    computed,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { InfoCardComponent } from '../../../../shared/ui/info-card/info-card.component';
import { MatchProtocolStore } from '../../model/match-protocol.store';
import {
    MatchEventType,
    MatchProtocolRosterPlayer,
    StartEventRecordingResponse,
} from '../../../../entities/match-service/model/match-service.types';

type GoalStep = 'team' | 'scorer' | 'assist';
type CardEventType = 'yellow_card' | 'second_yellow_card' | 'red_card';
type CardStep = 'team' | 'player';
type OwnGoalStep = 'team' | 'player';

interface GoalDraft {
    eventType: 'goal';
    half: number;
    second: number;
    minute: number;
    teamId?: number;
    playerId?: number;
    assistPlayerId?: number;
}
interface CardDraft {
    eventType: CardEventType;
    half: number;
    second: number;
    minute: number;
    teamId?: number;
    playerId?: number;
}

interface OwnGoalDraft {
    eventType: 'own_goal';
    half: number;
    second: number;
    minute: number;
    teamId?: number;
    playerId?: number;
}

@Component({
    selector: 'app-match-protocol-page',
    imports: [PageHeaderComponent, InfoCardComponent, DatePipe],
    templateUrl: './match-protocol-page.component.html',
    styleUrl: './match-protocol-page.component.scss',
    providers: [MatchProtocolStore],
})
export class MatchProtocolPageComponent {
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);

    readonly store = inject(MatchProtocolStore);

    readonly now = signal(Date.now());
    readonly isGoalModalOpen = signal(false);
    readonly goalStep = signal<GoalStep>('team');
    readonly goalDraft = signal<GoalDraft | null>(null);
    readonly isCardModalOpen = signal(false);
    readonly cardStep = signal<CardStep>('team');
    readonly cardDraft = signal<CardDraft | null>(null);
    readonly isOwnGoalModalOpen = signal(false);
    readonly ownGoalStep = signal<OwnGoalStep>('team');
    readonly ownGoalDraft = signal<OwnGoalDraft | null>(null);

    readonly matchId = Number(this.route.snapshot.paramMap.get('matchId'));

    readonly displaySeconds = computed(() => {
        const session = this.store.session();

        if (!session) {
            return 0;
        }

        const isRunning =
            session.status === 'first_half' || session.status === 'second_half';

        if (!isRunning || !session.startedAt) {
            return session.elapsedSeconds;
        }

        const startedAtMs = new Date(session.startedAt).getTime();
        const diffSeconds = Math.floor((this.now() - startedAtMs) / 1000);

        return session.elapsedSeconds + Math.max(diffSeconds, 0);
    });

    readonly displayTime = computed(() => {
        const totalSeconds = this.displaySeconds();
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${this.pad(minutes)}:${this.pad(seconds)}`;
    });

    readonly goalPlayers = computed(() => {
        const draft = this.goalDraft();
        const match = this.store.match();
        const rosters = this.store.rosters();

        if (!draft?.teamId || !match) {
            return [];
        }

        return draft.teamId === match.homeTeam.id ? rosters.home : rosters.away;
    });

    readonly selectedGoalTeamName = computed(() => {
        const draft = this.goalDraft();
        const match = this.store.match();

        if (!draft?.teamId || !match) {
            return '';
        }

        if (draft.teamId === match.homeTeam.id) {
            return match.homeTeam.shortName || match.homeTeam.name;
        }

        if (draft.teamId === match.awayTeam.id) {
            return match.awayTeam.shortName || match.awayTeam.name;
        }

        return '';
    });

    readonly cardPlayers = computed(() => {
        const draft = this.cardDraft();
        const match = this.store.match();
        const rosters = this.store.rosters();

        if (!draft?.teamId || !match) {
            return [];
        }

        return draft.teamId === match.homeTeam.id ? rosters.home : rosters.away;
    });

    readonly selectedCardTeamName = computed(() => {
        const draft = this.cardDraft();
        const match = this.store.match();

        if (!draft?.teamId || !match) {
            return '';
        }

        if (draft.teamId === match.homeTeam.id) {
            return match.homeTeam.shortName || match.homeTeam.name;
        }

        if (draft.teamId === match.awayTeam.id) {
            return match.awayTeam.shortName || match.awayTeam.name;
        }

        return '';
    });

    readonly cardModalTitle = computed(() => {
        const eventType = this.cardDraft()?.eventType;

        if (eventType === 'yellow_card') {
            return 'Жёлтая карточка';
        }

        if (eventType === 'second_yellow_card') {
            return 'Вторая жёлтая карточка';
        }

        if (eventType === 'red_card') {
            return 'Красная карточка';
        }

        return 'Карточка';
    });

    readonly ownGoalPlayers = computed(() => {
        const draft = this.ownGoalDraft();
        const match = this.store.match();
        const rosters = this.store.rosters();

        if (!draft?.teamId || !match) {
            return [];
        }

        return draft.teamId === match.homeTeam.id ? rosters.home : rosters.away;
    });

    readonly selectedOwnGoalTeamName = computed(() => {
        const draft = this.ownGoalDraft();
        const match = this.store.match();

        if (!draft?.teamId || !match) {
            return '';
        }

        if (draft.teamId === match.homeTeam.id) {
            return match.homeTeam.shortName || match.homeTeam.name;
        }

        if (draft.teamId === match.awayTeam.id) {
            return match.awayTeam.shortName || match.awayTeam.name;
        }

        return '';
    });

    constructor() {
        this.store.load(this.matchId);

        const timerId = window.setInterval(() => {
            this.now.set(Date.now());
        }, 1000);

        this.destroyRef.onDestroy(() => {
            window.clearInterval(timerId);
        });
    }

    goBack(): void {
        this.router.navigate(['/dashboard/match-service', this.matchId, 'rosters']);
    }

    start(): void {
        this.store.start(this.matchId);
    }

    pause(): void {
        this.store.pause(this.matchId);
    }

    resume(): void {
        this.store.resume(this.matchId);
    }

    finishHalf(): void {
        this.store.finishHalf(this.matchId);
    }

    startSecondHalf(): void {
        this.store.startSecondHalf(this.matchId);
    }

    finishMatch(): void {
        if (confirm('Завершить матч?')) {
            this.store.finishMatch(this.matchId);
        }
    }

    startGoalRecording(): void {
        this.store.startEventRecording(
            this.matchId,
            'goal',
            (response) => {
                this.goalDraft.set({
                    eventType: 'goal',
                    half: response.eventDraft.half,
                    second: response.eventDraft.second,
                    minute: response.eventDraft.minute,
                });

                this.goalStep.set('team');
                this.isGoalModalOpen.set(true);
            },
        );
    }

    cancelEvent(eventId: number): void {
        if (confirm('Отменить событие?')) {
            this.store.cancelEvent(this.matchId, eventId);
        }
    }

    closeGoalModal(): void {
        this.isGoalModalOpen.set(false);
        this.goalDraft.set(null);
        this.goalStep.set('team');
    }

    cancelGoalRecording(): void {
        this.store.cancelEventRecording(this.matchId);
        this.closeGoalModal();
    }

    getPlayerName(player: MatchProtocolRosterPlayer): string {
        const number = player.shirtNumber ? `№${player.shirtNumber} ` : '';

        return (
            number +
            [player.lastName, player.firstName, player.middleName]
                .filter(Boolean)
                .join(' ')
        );
    }

    private pad(value: number): string {
        return value.toString().padStart(2, '0');
    }

    selectGoalTeam(teamId: number): void {
        const current = this.goalDraft();

        if (!current) {
            return;
        }

        this.goalDraft.set({
            ...current,
            teamId,
        });

        this.goalStep.set('scorer');
    }

    selectGoalScorer(playerId: number): void {
        const current = this.goalDraft();

        if (!current) {
            return;
        }

        this.goalDraft.set({
            ...current,
            playerId,
        });

        this.goalStep.set('assist');
    }

    selectGoalAssist(assistPlayerId?: number): void {
        const current = this.goalDraft();

        if (!current || !current.teamId || !current.playerId) {
            return;
        }

        this.store.createEvent(this.matchId, {
            eventType: current.eventType,
            teamId: current.teamId,
            playerId: current.playerId,
            assistPlayerId,
            half: current.half,
            second: current.second,
            minute: current.minute,
            autoResume: true,
            clientEventId: crypto.randomUUID(),
        });

        this.closeGoalModal();
    }

    startCardRecording(eventType: CardEventType): void {
        this.store.startEventRecording(
            this.matchId,
            eventType,
            (response) => {
                this.cardDraft.set({
                    eventType,
                    half: response.eventDraft.half,
                    second: response.eventDraft.second,
                    minute: response.eventDraft.minute,
                });

                this.cardStep.set('team');
                this.isCardModalOpen.set(true);
            },
        );
    }

    selectCardTeam(teamId: number): void {
        const current = this.cardDraft();

        if (!current) {
            return;
        }

        this.cardDraft.set({
            ...current,
            teamId,
        });

        this.cardStep.set('player');
    }

    selectCardPlayer(playerId: number): void {
        const current = this.cardDraft();

        if (!current || !current.teamId) {
            return;
        }

        this.store.createEvent(this.matchId, {
            eventType: current.eventType,
            teamId: current.teamId,
            playerId,
            half: current.half,
            second: current.second,
            minute: current.minute,
            autoResume: true,
            clientEventId: crypto.randomUUID(),
        });

        this.closeCardModal();
    }

    closeCardModal(): void {
        this.isCardModalOpen.set(false);
        this.cardDraft.set(null);
        this.cardStep.set('team');
    }

    cancelCardRecording(): void {
        this.store.cancelEventRecording(this.matchId);
        this.closeCardModal();
    }

    startOwnGoalRecording(): void {
        this.store.startEventRecording(
            this.matchId,
            'own_goal',
            (response) => {
                this.ownGoalDraft.set({
                    eventType: 'own_goal',
                    half: response.eventDraft.half,
                    second: response.eventDraft.second,
                    minute: response.eventDraft.minute,
                });

                this.ownGoalStep.set('team');
                this.isOwnGoalModalOpen.set(true);
            },
        );
    }

    selectOwnGoalTeam(teamId: number): void {
        const current = this.ownGoalDraft();

        if (!current) {
            return;
        }

        this.ownGoalDraft.set({
            ...current,
            teamId,
        });

        this.ownGoalStep.set('player');
    }

    selectOwnGoalPlayer(playerId: number): void {
        const current = this.ownGoalDraft();

        if (!current || !current.teamId) {
            return;
        }

        this.store.createEvent(this.matchId, {
            eventType: current.eventType,
            teamId: current.teamId,
            playerId,
            half: current.half,
            second: current.second,
            minute: current.minute,
            autoResume: true,
            clientEventId: crypto.randomUUID(),
        });

        this.closeOwnGoalModal();
    }

    closeOwnGoalModal(): void {
        this.isOwnGoalModalOpen.set(false);
        this.ownGoalDraft.set(null);
        this.ownGoalStep.set('team');
    }

    cancelOwnGoalRecording(): void {
        this.store.cancelEventRecording(this.matchId);
        this.closeOwnGoalModal();
    }
}
