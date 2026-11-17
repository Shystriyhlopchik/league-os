import {
    Component,
    computed,
    HostListener,
    inject,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import {
    ManagedCalendar,
    TournamentApplicationApi,
} from '../../entities/tournament-application/tournament-application.api';
import {
    CalendarBatchIssue,
    CalendarBatchPreview,
    CalendarBatchRequest,
    CalendarScheduleState,
} from '../../entities/tournament-application/calendar-batch.types';
import {
    CalendarDraftRow,
    CalendarMatch,
    calendarDraftRow,
    shiftCalendarTime,
} from './calendar-draft';

@Component({
    selector: 'app-calendar-management',
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './calendar-management.component.html',
    styleUrl: './calendar-management.component.scss',
})
export class CalendarManagementComponent {
    private readonly api = inject(TournamentApplicationApi);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    readonly tournaments = signal<{ id: number; name: string }[]>([]);
    readonly calendar = signal<ManagedCalendar | null>(null);
    readonly drafts = signal<Record<number, CalendarDraftRow>>({});
    readonly busy = signal(false);
    readonly saving = signal(false);
    readonly needsRefresh = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly issues = signal<CalendarBatchIssue[]>([]);
    readonly review = signal<CalendarBatchPreview | null>(null);
    readonly round = signal(
        this.route.snapshot.queryParamMap.get('round') ?? '',
    );
    readonly stage = signal('');
    readonly group = signal('');
    readonly filter = signal('all');
    readonly selected = signal<number[]>([]);
    readonly changed = computed(() =>
        (this.calendar()?.matches ?? []).filter(
            (m) =>
                JSON.stringify(this.row(m)) !==
                JSON.stringify(calendarDraftRow(m)),
        ),
    );
    readonly rounds = computed(() =>
        [
            ...new Set(
                (this.calendar()?.matches ?? [])
                    .filter(
                        (m) =>
                            !this.stage() || String(m.stageId) === this.stage(),
                    )
                    .flatMap((m) => [m.roundNumber, this.row(m).roundNumber])
                    .filter((n): n is number => !!n),
            ),
        ].sort((a, b) => a - b),
    );
    readonly groups = computed(() => [
        ...new Map(
            (this.calendar()?.matches ?? [])
                .filter(
                    (m) =>
                        (!this.stage() || String(m.stageId) === this.stage()) &&
                        m.groupId,
                )
                .map((m) => [
                    m.groupId!,
                    m.groupName ?? `Группа #${m.groupId}`,
                ]),
        ).entries(),
    ]);
    readonly matches = computed(() =>
        (this.calendar()?.matches ?? []).filter(
            (m) =>
                (!this.stage() || String(m.stageId) === this.stage()) &&
                (!this.group() || String(m.groupId) === this.group()) &&
                (!this.round() ||
                    String(m.roundNumber) === this.round() ||
                    String(this.row(m).roundNumber) === this.round()) &&
                (this.filter() === 'all' ||
                    (this.filter() === 'changed'
                        ? this.isChanged(m)
                        : this.filter() === 'postponed'
                          ? this.row(m).postponed
                          : m.status === this.filter())),
        ),
    );
    tournamentId =
        Number(this.route.snapshot.queryParamMap.get('tournamentId')) || 0;
    reason = '';
    bulkDate = '';
    bulkVenueId = 0;
    bulkRound = 0;
    startTime = '18:00';
    shiftMinutes = 15;
    private prepared?: CalendarBatchRequest;
    private preparedKey = '';
    constructor() {
        void this.init();
    }
    private async init() {
        try {
            this.tournaments.set(
                await firstValueFrom(
                    this.api.managedCalendars().pipe(timeout(20000)),
                ),
            );
            if (this.tournamentId) await this.load(false);
        } catch (e) {
            this.error.set(
                this.errorMessage(e, 'Не удалось загрузить турниры'),
            );
        }
    }
    private setCalendar(value: ManagedCalendar) {
        this.calendar.set(value);
        this.drafts.set(
            Object.fromEntries(
                value.matches.map((m) => [m.id, calendarDraftRow(m)]),
            ),
        );
        this.selected.set([]);
        this.needsRefresh.set(false);
    }
    async switchTournament(value: number) {
        if (this.busy() || !this.canLeave()) return;
        this.calendar.set(null);
        this.drafts.set({});
        this.selected.set([]);
        this.tournamentId = Number(value);
        this.round.set('');
        this.stage.set('');
        this.group.set('');
        await this.load(false);
    }
    async load(ask = true) {
        if (this.busy() || (ask && !this.canLeave())) return;
        this.busy.set(true);
        this.error.set('');
        this.notice.set('');
        this.review.set(null);
        this.issues.set([]);
        this.prepared = undefined;
        this.reason = '';
        try {
            if (!this.tournamentId) {
                this.calendar.set(null);
                this.drafts.set({});
                return;
            }
            this.setCalendar(
                await firstValueFrom(
                    this.api.calendar(this.tournamentId).pipe(timeout(20000)),
                ),
            );
            void this.router.navigate([], {
                relativeTo: this.route,
                queryParams: {
                    tournamentId: this.tournamentId,
                    round: this.round() || null,
                },
                queryParamsHandling: 'merge',
                replaceUrl: true,
            });
        } catch (e) {
            this.error.set(
                this.errorMessage(e, 'Не удалось загрузить календарь'),
            );
        } finally {
            this.busy.set(false);
        }
    }
    row(m: CalendarMatch) {
        return this.drafts()[m.id] ?? calendarDraftRow(m);
    }
    isChanged(m: CalendarMatch) {
        return (
            JSON.stringify(this.row(m)) !== JSON.stringify(calendarDraftRow(m))
        );
    }
    editable(m: CalendarMatch) {
        return (
            m.status === 'scheduled' &&
            !['completed', 'cancelled'].includes(
                this.calendar()?.tournament?.lifecycleStatus ?? '',
            )
        );
    }
    disabled(m: CalendarMatch) {
        return !this.editable(m) || this.busy() || this.needsRefresh();
    }
    roundOptions(m: CalendarMatch) {
        return [
            ...new Set(
                (this.calendar()?.matches ?? [])
                    .filter(
                        (x) =>
                            x.stageId === m.stageId &&
                            x.groupId === m.groupId &&
                            x.status !== 'cancelled',
                    )
                    .map((x) => x.roundNumber)
                    .filter((n): n is number => !!n),
            ),
        ].sort((a, b) => a - b);
    }
    editField(m: CalendarMatch, field: keyof CalendarDraftRow, value: any) {
        if (this.disabled(m)) return;
        const row = {
            ...this.row(m),
            [field]: ['roundNumber', 'venueId', 'durationMinutes'].includes(
                field,
            )
                ? Number(value)
                : value,
        };
        if (
            field !== 'durationMinutes' &&
            !this.isChanged(m) &&
            !(m.scheduleRevision! > 0)
        ) {
            row.durationMinutes =
                m.defaultDurationMinutes ?? row.durationMinutes;
        }
        if ((field === 'date' || field === 'time') && value)
            row.postponed = false;
        this.drafts.update((rows) => ({ ...rows, [m.id]: row }));
        this.invalidate();
    }
    invalidate() {
        this.review.set(null);
        this.issues.set([]);
        this.error.set('');
        this.notice.set('');
    }
    setRound(value: string) {
        this.round.set(value);
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { round: value || null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    }
    stepRound(step: number) {
        const list = this.rounds();
        const index = list.indexOf(Number(this.round()));
        const value = list[index + step];
        if (value) this.setRound(String(value));
    }
    toggle(m: CalendarMatch, checked: boolean) {
        this.selected.update((ids) =>
            checked
                ? [...new Set([...ids, m.id])]
                : ids.filter((id) => id !== m.id),
        );
    }
    selectVisible(checked: boolean) {
        const ids = this.matches()
            .filter((m) => this.editable(m))
            .map((m) => m.id);
        this.selected.update((current) =>
            checked
                ? [...new Set([...current, ...ids])]
                : current.filter((id) => !ids.includes(id)),
        );
    }
    allVisibleSelected() {
        const ids = this.matches().filter((m) => this.editable(m));
        return (
            ids.length > 0 && ids.every((m) => this.selected().includes(m.id))
        );
    }
    selectedHidden() {
        return this.selected().filter(
            (id) => !this.matches().some((m) => m.id === id),
        ).length;
    }
    private selectedMatches() {
        return (this.calendar()?.matches ?? []).filter(
            (m) => this.selected().includes(m.id) && this.editable(m),
        );
    }
    bulkApply() {
        if (!this.bulkDate && !this.bulkVenueId) {
            this.error.set('Выберите дату или площадку для выделенных матчей.');
            return;
        }
        for (const m of this.selectedMatches()) {
            if (this.bulkDate) this.editField(m, 'date', this.bulkDate);
            if (this.bulkVenueId)
                this.editField(m, 'venueId', this.bulkVenueId);
        }
    }
    bulkMove() {
        const selected = this.selectedMatches();
        if (
            !this.bulkRound ||
            selected.some(
                (m) =>
                    !m.canChangeRound ||
                    !this.roundOptions(m).includes(Number(this.bulkRound)),
            )
        ) {
            this.error.set(
                'Выберите существующий тур той же группы для всех выделенных матчей. Раунды плей-офф перемещать нельзя.',
            );
            return;
        }
        for (const m of selected)
            this.editField(m, 'roundNumber', this.bulkRound);
    }
    bulkShift() {
        if (
            !Number.isInteger(Number(this.shiftMinutes)) ||
            Math.abs(Number(this.shiftMinutes)) > 1440
        ) {
            this.error.set(
                'Сдвиг должен быть целым числом от −1440 до 1440 минут.',
            );
            return;
        }
        const values = this.selectedMatches().map((m) => ({
            m,
            value: this.row(m).postponed
                ? null
                : shiftCalendarTime(
                      this.row(m).date,
                      this.row(m).time,
                      Number(this.shiftMinutes),
                  ),
        }));
        if (values.some((x) => !x.value)) {
            this.error.set(
                'Для сдвига назначьте дату и время всем выделенным матчам.',
            );
            return;
        }
        for (const { m, value } of values) {
            this.editField(m, 'date', value!.date);
            this.editField(m, 'time', value!.time);
        }
    }
    bulkSequence() {
        const selected = this.selectedMatches();
        if (!selected.length) return;
        const date = this.bulkDate || this.row(selected[0]).date,
            venue = Number(this.bulkVenueId) || this.row(selected[0]).venueId;
        if (
            !date ||
            !venue ||
            !shiftCalendarTime(date, this.startTime, 0) ||
            selected.some(
                (m) =>
                    (!this.bulkDate && this.row(m).date !== date) ||
                    (!this.bulkVenueId && this.row(m).venueId !== venue) ||
                    !Number.isInteger(this.row(m).durationMinutes) ||
                    this.row(m).durationMinutes < 1 ||
                    this.row(m).durationMinutes > 480,
            )
        ) {
            this.error.set(
                'Для последовательной расстановки выберите общую дату, площадку, время начала и корректную длительность слотов.',
            );
            return;
        }
        let next = { date, time: this.startTime };
        for (const m of selected) {
            this.editField(m, 'date', next.date);
            this.editField(m, 'time', next.time);
            this.editField(m, 'venueId', venue);
            next = shiftCalendarTime(
                next.date,
                next.time,
                this.row(m).durationMinutes,
            )!;
        }
    }
    undoRow(m: CalendarMatch) {
        this.drafts.update((rows) => ({
            ...rows,
            [m.id]: calendarDraftRow(m),
        }));
        this.invalidate();
    }
    undoAll() {
        if (
            !this.changed().length ||
            window.confirm('Отменить все несохранённые изменения?')
        ) {
            this.drafts.set(
                Object.fromEntries(
                    (this.calendar()?.matches ?? []).map((m) => [
                        m.id,
                        calendarDraftRow(m),
                    ]),
                ),
            );
            this.selected.set([]);
            this.invalidate();
            this.prepared = undefined;
        }
    }
    private request(): CalendarBatchRequest | null {
        const issues: CalendarBatchIssue[] = [];
        if (!this.reason.trim())
            issues.push({
                field: 'reason',
                message: 'Укажите общую причину изменения календаря.',
            });
        if (this.reason.trim().length > 1000)
            issues.push({
                field: 'reason',
                message: 'Причина не должна превышать 1000 символов.',
            });
        if (this.changed().length > 200)
            issues.push({
                field: 'batch',
                message: 'За один раз можно изменить не более 200 матчей.',
            });
        const changes = this.changed().map((m) => {
            const r = this.row(m);
            if (!r.postponed) {
                if (
                    !r.date ||
                    !r.time ||
                    !Number.isFinite(
                        new Date(`${r.date}T${r.time}:00Z`).getTime(),
                    )
                )
                    issues.push({
                        matchId: m.id,
                        field: 'matchDatetime',
                        message: `${m.home} — ${m.away}: укажите дату и время или выберите «Дата уточняется».`,
                    });
                if (!this.calendar()?.venues.some((v) => v.id === r.venueId))
                    issues.push({
                        matchId: m.id,
                        field: 'venueId',
                        message: `${m.home} — ${m.away}: выберите площадку.`,
                    });
            }
            if (
                !Number.isInteger(r.durationMinutes) ||
                r.durationMinutes < 1 ||
                r.durationMinutes > 480
            )
                issues.push({
                    matchId: m.id,
                    field: 'durationMinutes',
                    message: `${m.home} — ${m.away}: слот должен быть от 1 до 480 минут.`,
                });
            return {
                id: m.id,
                expectedRevision: m.scheduleRevision ?? 0,
                ...(r.roundNumber ? { roundNumber: r.roundNumber } : {}),
                postponed: r.postponed,
                ...(r.postponed
                    ? {}
                    : {
                          matchDatetime: `${r.date}T${r.time}`,
                          venueId: r.venueId,
                      }),
                durationMinutes: r.durationMinutes,
            };
        });
        this.issues.set(issues);
        if (issues.length) {
            this.error.set(
                'Проверьте отмеченные поля. Изменения не отправлены.',
            );
            return null;
        }
        const data = { reason: this.reason.trim(), changes },
            key = JSON.stringify(data);
        if (!this.prepared || key !== this.preparedKey) {
            this.prepared = { ...data, requestId: crypto.randomUUID() };
            this.preparedKey = key;
        }
        return this.prepared;
    }
    async preview() {
        if (this.busy() || this.needsRefresh() || !this.changed().length)
            return;
        this.error.set('');
        this.notice.set('');
        const body = this.request();
        if (!body) return;
        this.busy.set(true);
        try {
            const result = await firstValueFrom(
                this.api
                    .previewCalendarBatch(this.tournamentId, body)
                    .pipe(timeout(25000)),
            );
            if (result.replayed) {
                await this.saved(result.updatedCount, true);
                return;
            }
            this.issues.set(result.issues);
            this.review.set(result.valid ? result : null);
            if (!result.valid)
                this.error.set(
                    'Календарь не сохранён. Исправьте конфликты в списке ниже.',
                );
            this.scrollToResult(
                result.valid ? 'calendar-review-title' : 'calendar-issues',
            );
        } catch (e) {
            this.error.set(
                this.errorMessage(
                    e,
                    'Не удалось проверить изменения. Черновик сохранён на этом экране.',
                ),
            );
        } finally {
            this.busy.set(false);
        }
    }
    async save() {
        const review = this.review(),
            body = this.prepared;
        if (this.busy() || !review?.version || !body) return;
        this.busy.set(true);
        this.saving.set(true);
        this.error.set('');
        try {
            const result = await firstValueFrom(
                this.api
                    .saveCalendarBatch(this.tournamentId, {
                        ...body,
                        expectedVersion: review.version,
                    })
                    .pipe(timeout(25000)),
            );
            await this.saved(result.updatedCount, result.replayed);
        } catch (e: any) {
            this.error.set(
                this.errorMessage(
                    e,
                    'Не удалось сохранить календарь. Черновик не удалён.',
                ),
            );
            if (e?.error?.issues) this.issues.set(e.error.issues);
            if (e?.status === 409) this.review.set(null);
            this.scrollToResult('calendar-feedback');
        } finally {
            this.busy.set(false);
            this.saving.set(false);
        }
    }
    private async saved(count: number, replayed: boolean) {
        this.notice.set(
            `Календарь сохранён: обновлено матчей — ${count}.${replayed ? ' Повторный запрос не дублировал изменения.' : ''}`,
        );
        this.review.set(null);
        this.prepared = undefined;
        this.selected.set([]);
        this.reason = '';
        this.drafts.set(
            Object.fromEntries(
                (this.calendar()?.matches ?? []).map((m) => [
                    m.id,
                    calendarDraftRow(m),
                ]),
            ),
        );
        this.needsRefresh.set(true);
        try {
            this.setCalendar(
                await firstValueFrom(
                    this.api.calendar(this.tournamentId).pipe(timeout(20000)),
                ),
            );
        } catch {
            this.error.set(
                'Изменения сохранены, но список не обновился. Нажмите «Обновить», прежде чем продолжать редактирование.',
            );
        }
        this.scrollToResult('calendar-feedback');
    }
    private scrollToResult(id: string) {
        requestAnimationFrame(() =>
            document.getElementById(id)?.scrollIntoView({
                block: 'center',
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                    .matches
                    ? 'auto'
                    : 'smooth',
            }),
        );
    }
    fieldIssue(id: number, field: string) {
        return this.issues().some(
            (i) =>
                (id ? i.matchId === id || i.otherMatchId === id : !i.matchId) &&
                i.field === field,
        );
    }
    issueMatch(issue: CalendarBatchIssue) {
        return (this.calendar()?.matches ?? []).find(
            (m) => m.id === issue.matchId,
        );
    }
    showIssue(issue: CalendarBatchIssue) {
        const m = this.issueMatch(issue);
        if (!m) return;
        this.stage.set('');
        this.group.set('');
        this.filter.set('all');
        this.setRound(String(m.roundNumber ?? ''));
        requestAnimationFrame(() =>
            document
                .getElementById(`calendar-match-${m.id}`)
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
        );
    }
    stateLabel(s: CalendarScheduleState) {
        const venue =
            this.calendar()?.venues.find((v) => v.id === s.venueId)?.name ??
            'без площадки';
        return `${s.roundNumber ? 'Тур ' + s.roundNumber + ' · ' : ''}${s.postponed ? 'Дата уточняется' : s.matchDatetime ? s.matchDatetime.slice(0, 16).replace('T', ' ') : 'Дата не назначена'} · ${venue} · ${s.durationMinutes} мин`;
    }
    endTime(m: CalendarMatch) {
        const r = this.row(m);
        if (r.postponed) return '';
        const end = shiftCalendarTime(r.date, r.time, r.durationMinutes);
        return end
            ? `до ${end.time}${end.date !== r.date ? ' (+1 день)' : ''}`
            : '';
    }
    statusLabel(status: string) {
        return (
            (
                {
                    scheduled: 'Не начат',
                    live: 'Идёт',
                    finished: 'Завершён',
                    cancelled: 'Отменён',
                } as Record<string, string>
            )[status] ?? status
        );
    }
    exportDraft() {
        const value = {
            tournamentId: this.tournamentId,
            reason: this.reason,
            changes: this.changed().map((m) => ({
                match: `${m.home} — ${m.away}`,
                expectedRevision: m.scheduleRevision ?? 0,
                ...this.row(m),
            })),
        };
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(value, null, 2)], {
                type: 'application/json',
            }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = `calendar-draft-${this.tournamentId}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    canLeave() {
        return (
            !this.saving() &&
            (!this.changed().length ||
                window.confirm(
                    'В календаре есть несохранённые изменения. Покинуть страницу и потерять черновик? Перед этим его можно скачать.',
                ))
        );
    }
    @HostListener('window:beforeunload', ['$event']) beforeUnload(
        event: BeforeUnloadEvent,
    ) {
        if (this.changed().length || this.saving()) {
            event.preventDefault();
            event.returnValue = '';
        }
    }
    private errorMessage(e: any, fallback: string) {
        if (e?.name === 'TimeoutError' || e?.status === 0)
            return 'Нет подтверждения от сервера. Черновик не удалён. Проверьте соединение и повторите то же сохранение: уже принятый пакет не будет применён повторно.';
        const message = e?.error?.message;
        return Array.isArray(message)
            ? message.join('. ')
            : typeof message === 'string'
              ? message
              : fallback;
    }
}
