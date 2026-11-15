import {
    computed,
    DestroyRef,
    inject,
    Injectable,
    Injector,
    signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, take, timeout } from 'rxjs';
import { MatchServiceApi } from '../../../entities/match-service/api/match-service.api';
import { SessionStore } from '../../../entities/user/model/session.store';
import {
    CreateMatchServiceEventDto,
    FinalizePlayedMatch,
    MatchCommand,
    MatchCommandAction,
    MatchEventType,
    MatchProtocolData,
    StartEventRecordingResponse,
} from '../../../entities/match-service/model/match-service.types';
import { elapsedAt, projectCommand } from './match-command-state';
import {
    MatchProtocolJournal,
    ProtocolJournal,
} from './match-protocol-journal';
import { cacheMatchShell } from './match-offline-shell';

@Injectable()
export class MatchProtocolStore {
    private readonly api = inject(MatchServiceApi);
    private readonly storage = inject(MatchProtocolJournal);
    private readonly identity = inject(SessionStore);
    private readonly destroyRef = inject(DestroyRef);
    private readonly injector = inject(Injector);
    private journal?: ProtocolJournal;
    private currentMatchId?: number;
    private busy = false;
    private readonly locked = signal(false);
    private destroyed = false;
    readonly data = signal<MatchProtocolData | null>(null);
    readonly isLoading = signal(false);
    private readonly saving = signal(false);
    readonly isActionLoading = computed(
        () =>
            this.saving() ||
            this.isSyncing() ||
            this.conflict() ||
            this.locked(),
    );
    readonly isSyncing = signal(false);
    readonly error = signal<string | null>(null);
    readonly pendingCount = signal(0);
    readonly offline = signal(!navigator.onLine);
    readonly shellReady = signal(false);
    readonly conflict = signal(false);
    readonly serverComparison = signal<MatchProtocolData | null>(null);
    readonly match = computed(() => this.data()?.match ?? null);
    readonly session = computed(() => this.data()?.session ?? null);
    readonly rosters = computed(
        () => this.data()?.rosters ?? { home: [], away: [] },
    );
    readonly events = computed(
        () => this.data()?.events.filter((e) => !e.isCancelled) ?? [],
    );
    readonly isNotStarted = computed(
        () => this.session()?.status === 'not_started',
    );
    readonly isRunning = computed(() =>
        ['first_half', 'second_half'].includes(this.session()?.status ?? ''),
    );
    readonly isPaused = computed(() => this.session()?.status === 'paused');
    readonly isHalfTime = computed(
        () => this.session()?.status === 'half_time',
    );
    readonly isEventRecording = computed(
        () => this.session()?.status === 'event_recording',
    );
    readonly isFinished = computed(() => this.session()?.status === 'finished');
    readonly redBalls = computed(
        () => this.data()?.redBalls ?? { active: [], usedTeamIds: [] },
    );
    readonly activeRedBall = computed(() => this.redBalls().active[0] ?? null);
    readonly canRecover = computed(
        () =>
            this.identity.canManageCommunityTournaments() &&
            this.match()?.status === 'live',
    );

    constructor() {
        const connected = () => {
            this.offline.set(false);
            void this.synchronize();
        };
        const disconnected = () => this.offline.set(true);
        const cached = (event: MessageEvent) => {
            if (event.data?.type === 'MATCH_SHELL_CACHED')
                this.shellReady.set(true);
        };
        navigator.serviceWorker?.addEventListener('message', cached);
        window.addEventListener('online', connected);
        window.addEventListener('offline', disconnected);
        const retry = window.setInterval(() => {
            if (this.pendingCount()) void this.synchronize();
        }, 5000);
        this.destroyRef.onDestroy(() => {
            this.destroyed = true;
            clearInterval(retry);
            window.removeEventListener('online', connected);
            window.removeEventListener('offline', disconnected);
            navigator.serviceWorker?.removeEventListener('message', cached);
        });
    }

    private key(matchId: number): string {
        const id = this.identity.user()?.id;
        if (!id)
            throw new Error('Для работы с протоколом требуется авторизация');
        return `${id}:${matchId}`;
    }

    private render(): void {
        if (!this.journal) return;
        this.data.set(
            this.journal.pending.reduce(projectCommand, this.journal.confirmed),
        );
        this.pendingCount.set(this.journal.pending.length);
    }

    async load(matchId: number): Promise<void> {
        if (this.busy) return;
        this.currentMatchId = matchId;
        this.isLoading.set(true);
        try {
            if (!this.identity.user())
                await firstValueFrom(
                    toObservable(this.identity.user, {
                        injector: this.injector,
                    }).pipe(filter(Boolean), take(1), timeout(15000)),
                );
            await this.exclusive(async () => {
                this.journal = await this.storage.read(this.key(matchId));
                if (this.journal) this.render();
                if (!this.journal?.pending.length && navigator.onLine) {
                    const confirmed = await firstValueFrom(
                        this.api.getSession(matchId).pipe(timeout(15000)),
                    );
                    this.journal = {
                        key: this.key(matchId),
                        confirmed,
                        pending: [],
                    };
                    await this.storage.save(this.journal);
                    this.render();
                    void cacheMatchShell().catch(() =>
                        this.shellReady.set(false),
                    );
                }
                if (!this.journal)
                    throw new Error(
                        'Нет сохранённого протокола. Откройте матч при работающем интернете',
                    );
                this.error.set(null);
            });
        } catch (e: any) {
            this.error.set(
                e?.error?.message ?? e.message ?? 'Не удалось загрузить матч',
            );
        } finally {
            this.isLoading.set(false);
        }
        void this.synchronize();
    }

    // Serialize persistence and HTTP under a cross-tab lock. A second tab must
    // reload its journal instead of overwriting actions saved by the first one.
    private async exclusive(work: () => Promise<void>): Promise<void> {
        if (this.busy || !this.currentMatchId) return;
        this.busy = true;
        this.locked.set(true);
        try {
            if (
                this.journal &&
                this.journal.key !== this.key(this.currentMatchId)
            )
                throw new Error(
                    'Этот журнал принадлежит другой учётной записи. Войдите под исходным пользователем',
                );
            if (!navigator.locks)
                throw new Error(
                    'Для надёжной офлайн-работы обновите браузер (нужна поддержка Web Locks)',
                );
            await navigator.locks.request(
                `match-protocol:${this.key(this.currentMatchId)}`,
                async () => {
                    try {
                        await work();
                    } catch (e: any) {
                        this.error.set(
                            e?.error?.message ??
                                e.message ??
                                'Ошибка сохранения',
                        );
                    }
                },
            );
        } catch (e: any) {
            this.error.set(
                e?.error?.message ?? e.message ?? 'Ошибка сохранения',
            );
        } finally {
            this.busy = false;
            this.locked.set(false);
        }
    }

    private async enqueue(
        action: MatchCommandAction,
        payload: Partial<MatchCommand> = {},
        onSaved?: (c: MatchCommand) => void,
    ): Promise<void> {
        if (
            !this.journal ||
            !this.data() ||
            this.conflict() ||
            this.isActionLoading()
        )
            return;
        this.saving.set(true);
        await this.exclusive(async () => {
            const saved = await this.storage.read(this.journal!.key);
            if (!saved) throw new Error('Журнал недоступен');
            if (JSON.stringify(saved) !== JSON.stringify(this.journal)) {
                this.journal = saved;
                this.render();
                throw new Error(
                    'Протокол изменён в другой вкладке. Проверьте состояние и повторите действие',
                );
            }
            const current = this.data()!;
            const command: MatchCommand = {
                ...payload,
                id: crypto.randomUUID(),
                action,
                expectedRevision: current.session.revision ?? 0,
                occurredAt: new Date().toISOString(),
                elapsedSeconds:
                    payload.elapsedSeconds ?? elapsedAt(current, Date.now()),
            };
            const next = { ...saved, pending: [...saved.pending, command] };
            // If IndexedDB fails, do not pretend the action has been saved.
            await this.storage.save(next);
            this.journal = next;
            this.render();
            this.error.set(null);
            onSaved?.(command);
        });
        this.saving.set(false);
        void this.synchronize();
    }

    async synchronize(): Promise<void> {
        if (
            !navigator.onLine ||
            this.conflict() ||
            this.isLoading() ||
            this.busy ||
            !this.journal?.pending.length
        )
            return;
        await this.exclusive(async () => {
            this.isSyncing.set(true);
            try {
                this.journal = await this.storage.read(this.journal!.key);
                this.render();
                while (this.journal?.pending.length && !this.destroyed) {
                    const command = this.journal.pending[0];
                    const response = await firstValueFrom(
                        this.api
                            .command(this.currentMatchId!, command)
                            .pipe(timeout(15000)),
                    );
                    const next = {
                        ...this.journal,
                        confirmed: response.data,
                        pending: this.journal.pending.slice(1),
                    };
                    // A crash before saving the acknowledgment retries the same UUID.
                    await this.storage.save(next);
                    this.journal = next;
                    this.render();
                }
                this.offline.set(false);
                this.error.set(null);
            } catch (e: any) {
                const network =
                    e.status === 0 ||
                    e.status === 502 ||
                    e.status === 503 ||
                    e.status === 504 ||
                    e.name === 'TimeoutError';
                if (network) this.offline.set(true);
                else {
                    this.conflict.set(true);
                    this.error.set(
                        e?.error?.message ??
                            e.message ??
                            'Синхронизация остановлена. Нужна сверка протокола',
                    );
                }
            } finally {
                this.isSyncing.set(false);
            }
        });
    }

    async compareWithServer(): Promise<void> {
        try {
            this.serverComparison.set(
                await firstValueFrom(
                    this.api
                        .getSession(this.currentMatchId!)
                        .pipe(timeout(15000)),
                ),
            );
        } catch (e: any) {
            this.error.set(e?.error?.message ?? 'Сервер недоступен');
        }
    }

    exportJournal(): void {
        if (!this.journal) return;
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(this.journal, null, 2)], {
                type: 'application/json',
            }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `protocol-${this.currentMatchId}-backup.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async useServerVersion(): Promise<void> {
        if (
            !this.serverComparison() ||
            !confirm(
                'Локальная очередь будет удалена после сохранения резервного JSON. Продолжить?',
            )
        )
            return;
        this.exportJournal();
        await this.exclusive(async () => {
            const confirmed = await firstValueFrom(
                this.api.getSession(this.currentMatchId!).pipe(timeout(15000)),
            );
            const next = {
                key: this.key(this.currentMatchId!),
                confirmed,
                pending: [],
            };
            await this.storage.save(next);
            this.journal = next;
            this.render();
            this.conflict.set(false);
            this.serverComparison.set(null);
            this.error.set(null);
        });
    }

    start(id: number): void {
        void this.enqueue('start');
    }
    pause(id: number): void {
        void this.enqueue('pause');
    }
    resume(id: number): void {
        void this.enqueue('resume');
    }
    finishHalf(id: number, result: FinalizePlayedMatch = {}): void {
        void this.enqueue('finish-half', { result });
    }
    startSecondHalf(id: number): void {
        void this.enqueue('start-second-half');
    }
    finishMatch(id: number, result: FinalizePlayedMatch = {}): void {
        void this.enqueue('finish', { result });
    }
    startEventRecording(
        id: number,
        eventType: MatchEventType,
        done: (r: StartEventRecordingResponse) => void,
    ): void {
        void this.enqueue('start-recording', { eventType }, (c) =>
            done({
                session: this.session()!,
                eventDraft: {
                    eventType,
                    half: this.session()!.currentHalf,
                    second: c.elapsedSeconds,
                    minute: Math.max(1, Math.ceil(c.elapsedSeconds / 60)),
                },
            }),
        );
    }
    createEvent(id: number, event: CreateMatchServiceEventDto): void {
        void this.enqueue('event', { event });
    }
    cancelEventRecording(id: number): void {
        void this.enqueue('cancel-recording');
    }
    cancelEvent(id: number, eventId: number): void {
        const event = this.events().find((e) => e.id === eventId);
        void this.enqueue(
            'cancel-event',
            event?.clientEventId
                ? { eventClientId: event.clientEventId }
                : { eventId },
        );
    }
    activateRedBall(id: number, teamId: number): void {
        void this.enqueue('red-ball', { teamId: Number(teamId) });
    }
    signProtocol(id: number): void {
        if (!navigator.onLine || this.pendingCount()) {
            this.error.set(
                'Сначала синхронизируйте все действия. Подпись требует связи с сервером',
            );
            return;
        }
        void this.enqueue('sign');
    }
    recover(reason: string, elapsedSeconds = 0): void {
        if (reason.trim())
            void this.enqueue('recover', { reason, elapsedSeconds });
    }
}
