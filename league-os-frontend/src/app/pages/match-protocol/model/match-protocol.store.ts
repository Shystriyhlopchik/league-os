import { computed, inject, Injectable, signal } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { MatchServiceApi } from '../../../entities/match-service/api/match-service.api';
import {
    CreateMatchServiceEventDto,
    MatchEventType,
    MatchProtocolData,
    MatchProtocolEvent,
    MatchServiceSession,
    MatchServiceStatus,
    StartEventRecordingResponse,
} from '../../../entities/match-service/model/match-service.types';

@Injectable()
export class MatchProtocolStore {
    private readonly api = inject(MatchServiceApi);

    readonly data = signal<MatchProtocolData | null>(null);
    readonly isLoading = signal(false);
    readonly isActionLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly match = computed(() => this.data()?.match ?? null);
    readonly session = computed(() => this.data()?.session ?? null);
    readonly rosters = computed(() => {
        return this.data()?.rosters ?? { home: [], away: [] };
    });
    readonly events = computed(() => this.data()?.events ?? []);

    readonly isNotStarted = computed(() => {
        return this.session()?.status === 'not_started';
    });

    readonly isRunning = computed(() => {
        const status = this.session()?.status;

        return status === 'first_half' || status === 'second_half';
    });

    readonly isPaused = computed(() => {
        return this.session()?.status === 'paused';
    });

    readonly isHalfTime = computed(() => {
        return this.session()?.status === 'half_time';
    });

    readonly isEventRecording = computed(() => {
        return this.session()?.status === 'event_recording';
    });

    readonly isFinished = computed(() => {
        return this.session()?.status === 'finished';
    });

    load(matchId: number): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.api
            .getSession(matchId)
            .pipe(
                tap((data) => {
                    this.data.set(data);
                }),
                catchError((error) => {
                    this.error.set(
                        error?.error?.message ?? 'Не удалось загрузить матч',
                    );
                    this.data.set(null);

                    return EMPTY;
                }),
                finalize(() => {
                    this.isLoading.set(false);
                }),
            )
            .subscribe();
    }

    start(matchId: number): void {
        this.runSessionAction(() => this.api.startMatch(matchId));
    }

    pause(matchId: number): void {
        this.runSessionAction(() => this.api.pauseMatch(matchId));
    }

    resume(matchId: number): void {
        this.runSessionAction(() => this.api.resumeMatch(matchId));
    }

    finishHalf(matchId: number): void {
        this.runSessionAction(() => this.api.finishHalf(matchId));
    }

    startSecondHalf(matchId: number): void {
        this.runSessionAction(() => this.api.startSecondHalf(matchId));
    }

    finishMatch(matchId: number): void {
        this.runSessionAction(() => this.api.finishMatch(matchId));
    }

    startEventRecording(
        matchId: number,
        eventType: MatchEventType,
        onSuccess: (response: StartEventRecordingResponse) => void,
    ): void {
        this.isActionLoading.set(true);
        this.error.set(null);

        this.api
            .startEventRecording(matchId, { eventType })
            .pipe(
                tap((response) => {
                    this.patchSession(response.session);
                    onSuccess(response);
                }),
                catchError((error) => {
                    this.error.set(
                        error?.error?.message ??
                            'Не удалось начать фиксацию события',
                    );

                    return EMPTY;
                }),
                finalize(() => {
                    this.isActionLoading.set(false);
                }),
            )
            .subscribe();
    }

    createEvent(matchId: number, dto: CreateMatchServiceEventDto): void {
        this.isActionLoading.set(true);
        this.error.set(null);

        this.api
            .createEvent(matchId, dto)
            .pipe(
                tap((response) => {
                    this.patchSession(response.session);
                    this.addEvent(response.event);
                }),
                catchError((error) => {
                    this.error.set(
                        error?.error?.message ?? 'Не удалось сохранить событие',
                    );

                    return EMPTY;
                }),
                finalize(() => {
                    this.isActionLoading.set(false);
                }),
            )
            .subscribe();
    }

    cancelEvent(matchId: number, eventId: number): void {
        this.isActionLoading.set(true);
        this.error.set(null);

        this.api
            .cancelEvent(matchId, eventId)
            .pipe(
                tap((response) => {
                    this.patchSession(response.session);
                    this.patchEvents(response.events);
                }),
                catchError((error) => {
                    this.error.set(
                        error?.error?.message ?? 'Не удалось отменить событие',
                    );

                    return EMPTY;
                }),
                finalize(() => {
                    this.isActionLoading.set(false);
                }),
            )
            .subscribe();
    }

    cancelEventRecording(matchId: number): void {
        this.isActionLoading.set(true);
        this.error.set(null);

        this.api
            .cancelEventRecording(matchId)
            .pipe(
                tap((session) => {
                    this.patchSession(session);
                }),
                catchError((error) => {
                    this.error.set(
                        error?.error?.message ?? 'Не удалось отменить фиксацию события',
                    );

                    return EMPTY;
                }),
                finalize(() => {
                    this.isActionLoading.set(false);
                }),
            )
            .subscribe();
    }

    private runSessionAction(
        action: () => Observable<MatchServiceSession>,
    ): void {
        this.isActionLoading.set(true);
        this.error.set(null);

        action()
            .pipe(
                tap((session) => {
                    this.patchSession(session);
                }),
                catchError((error) => {
                    this.error.set(error?.error?.message ?? 'Ошибка действия');

                    return EMPTY;
                }),
                finalize(() => {
                    this.isActionLoading.set(false);
                }),
            )
            .subscribe();
    }

    private patchSession(session: MatchServiceSession): void {
        const current = this.data();

        if (!current) {
            return;
        }

        this.data.set({
            ...current,
            session,
        });
    }

    private addEvent(event: MatchProtocolEvent): void {
        const current = this.data();

        if (!current) {
            return;
        }

        this.data.set({
            ...current,
            events: [...current.events, event],
        });
    }

    private patchEvents(events: MatchProtocolEvent[]): void {
        const current = this.data();

        if (!current) {
            return;
        }

        this.data.set({
            ...current,
            events,
        });
    }
}
