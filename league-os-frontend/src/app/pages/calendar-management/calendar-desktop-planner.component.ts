import {
    Component,
    ElementRef,
    computed,
    input,
    output,
    signal,
    SimpleChanges,
    viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    CdkDrag,
    CdkDragDrop,
    CdkDropList,
    DragDropModule,
} from '@angular/cdk/drag-drop';
import { ManagedCalendar } from '../../entities/tournament-application/tournament-application.api';
import { CalendarBatchIssue } from '../../entities/tournament-application/calendar-batch.types';
import {
    CalendarDraftRow,
    CalendarMatch,
    calendarDraftRow,
    shiftCalendarTime,
} from './calendar-draft';
import {
    PlannerDay,
    PlannerScope,
    PlannerSlot,
    plannerAssigned,
    plannerAssign,
    plannerDayKey,
    plannerOccupants,
    plannerOverlapIds,
    plannerRow,
    plannerScopeKey,
    plannerSlotKey,
} from './calendar-planner.model';

type DropTarget =
    | { kind: 'bank' }
    | { kind: 'day'; day: PlannerDay }
    | { kind: 'slot'; slot: PlannerSlot };
type Editor = 'day' | 'slot' | 'match' | 'swap' | null;
@Component({
    selector: 'app-calendar-desktop-planner',
    imports: [CommonModule, FormsModule, DragDropModule],
    templateUrl: './calendar-desktop-planner.component.html',
    styleUrl: './calendar-desktop-planner.component.scss',
})
export class CalendarDesktopPlannerComponent {
    readonly calendar = input.required<ManagedCalendar>();
    readonly drafts = input.required<Record<number, CalendarDraftRow>>();
    readonly disabled = input(false);
    readonly issues = input<CalendarBatchIssue[]>([]);
    readonly round = input('');
    readonly rowsChange = output<CalendarDraftRow[]>();
    readonly roundChange = output<string>();
    readonly refresh = output<void>();
    readonly scopeSelection = signal('');
    readonly daySelection = signal('');
    readonly additionalDays = signal<PlannerDay[]>([]);
    readonly customSlots = signal<PlannerSlot[]>([]);
    readonly bankFilter = signal<'unscheduled' | 'all'>('unscheduled');
    readonly search = signal('');
    readonly picked = signal<number | null>(null);
    readonly feedback = signal('');
    readonly feedbackError = signal(false);
    readonly editor = signal<Editor>(null);
    readonly editorError = signal('');
    readonly editorMatch = signal<CalendarMatch | null>(null);
    readonly swap = signal<{
        id: number;
        other: CalendarMatch;
        slot: PlannerSlot;
    } | null>(null);
    private readonly dialog =
        viewChild<ElementRef<HTMLDialogElement>>('plannerDialog');
    private readonly columns =
        viewChild<ElementRef<HTMLElement>>('plannerColumns');
    readonly panelHeight = signal<number | null>(null);
    private layoutObserver?: ResizeObserver;
    private readonly resizeLayout = () => {
        const columns = this.columns()?.nativeElement;
        if (!columns) return;
        // Reserve the common save bar; messages above the grid must not push
        // the day controls underneath that sticky bar.
        const top = columns.getBoundingClientRect().top + window.scrollY;
        const height = Math.max(
            360,
            Math.min(840, window.innerHeight - top - 100),
        );
        if (Math.abs((this.panelHeight() ?? 0) - height) > 1)
            this.panelHeight.set(height);
    };
    ngAfterViewInit() {
        const columns = this.columns()?.nativeElement;
        const page =
            columns?.closest('.calendar-management') ?? columns?.parentElement;
        if (page) {
            this.layoutObserver = new ResizeObserver(this.resizeLayout);
            this.layoutObserver.observe(page);
        }
        window.addEventListener('resize', this.resizeLayout);
    }
    ngOnDestroy() {
        this.layoutObserver?.disconnect();
        window.removeEventListener('resize', this.resizeLayout);
    }
    readonly scopes = computed<PlannerScope[]>(() => [
        ...new Map(
            this.calendar().matches.map((m) => {
                const stage = this.calendar().stages.find(
                    (s) => s.id === m.stageId,
                );
                return [
                    plannerScopeKey(m),
                    {
                        key: plannerScopeKey(m),
                        stageId: m.stageId,
                        groupId: m.groupId,
                        label:
                            [
                                stage?.name,
                                m.groupName ??
                                    (m.groupId ? `Группа #${m.groupId}` : null),
                            ]
                                .filter(Boolean)
                                .join(' · ') || 'Матчи турнира',
                    },
                ] as const;
            }),
        ).values(),
    ]);
    readonly scope = computed<PlannerScope | undefined>(
        () =>
            this.scopes().find((s) => s.key === this.scopeSelection()) ??
            this.scopes()[0],
    );
    readonly scopedMatches = computed(() =>
        this.calendar().matches.filter(
            (m) => plannerScopeKey(m) === this.scope()?.key,
        ),
    );
    readonly days = computed(() => {
        const key = this.scope()?.key;
        if (!key) return [];
        const result = new Map<string, PlannerDay>();
        for (const m of this.scopedMatches())
            for (const r of [calendarDraftRow(m), this.row(m)]) {
                const date = plannerAssigned(r) ? r.date : '';
                const day: PlannerDay = {
                    key: plannerDayKey(key, r.roundNumber, date),
                    scopeKey: key,
                    roundNumber: r.roundNumber,
                    date,
                    label: r.roundNumber
                        ? `${r.roundNumber} тур`
                        : (m.round ?? 'Матчи этапа'),
                };
                result.set(day.key, day);
            }
        for (const d of this.additionalDays().filter((d) => d.scopeKey === key))
            result.set(d.key, d);
        // Only show a dateless navigation item if this round has no dated day yet.
        return [...result.values()]
            .filter(
                (d) =>
                    d.date ||
                    ![...result.values()].some(
                        (x) => x.roundNumber === d.roundNumber && !!x.date,
                    ),
            )
            .sort(
                (a, b) =>
                    (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
                    a.date.localeCompare(b.date),
            );
    });
    readonly day = computed<PlannerDay | undefined>(() => {
        const selected = this.days().find((d) => d.key === this.daySelection());
        return selected &&
            (!this.round() ||
                String(selected.roundNumber ?? '') === this.round())
            ? selected
            : (this.days().find(
                  (d) => this.round() && String(d.roundNumber) === this.round(),
              ) ?? this.days()[0]);
    });
    readonly dayMatches = computed(() =>
        this.scopedMatches().filter((m) => {
            const r = this.row(m),
                d = this.day();
            return (
                d &&
                r.roundNumber === d.roundNumber &&
                r.date === d.date &&
                plannerAssigned(r)
            );
        }),
    );
    readonly unscheduled = computed(() =>
        this.scopedMatches().filter(
            (m) => this.editable(m) && !plannerAssigned(this.row(m)),
        ),
    );
    readonly bankMatches = computed(() => {
        const list =
            this.bankFilter() === 'unscheduled'
                ? this.unscheduled()
                : this.scopedMatches().filter((m) => this.editable(m));
        const query = this.search().trim().toLocaleLowerCase('ru');
        return list.filter(
            (m) =>
                !query ||
                `${m.home} ${m.away}`.toLocaleLowerCase('ru').includes(query),
        );
    });
    readonly defaultDuration = computed(() => {
        const m =
            this.scopedMatches().find((m) => m.defaultDurationMinutes) ||
            this.scopedMatches()[0];
        return m?.defaultDurationMinutes ?? m?.durationMinutes ?? 60;
    });
    readonly pickedMatch = computed(() =>
        this.calendar().matches.find((m) => m.id === this.picked()),
    );
    readonly overlaps = computed(() =>
        plannerOverlapIds(this.calendar().matches, this.drafts()),
    );
    readonly visibleVenues = computed(() => {
        const custom = this.customSlots()
            .filter(
                (s) =>
                    plannerDayKey(s.scopeKey, s.roundNumber, s.date) ===
                    this.day()?.key,
            )
            .map((s) => s.venueId);
        const used = this.dayMatches().map((m) => this.row(m).venueId);
        const ids = [...used, ...custom];
        return ids.length
            ? this.calendar().venues.filter((v) => ids.includes(v.id))
            : this.calendar().venues.slice(0, 2);
    });
    readonly slots = computed(() => {
        const d = this.day();
        if (!d?.date) return [];
        const slots = new Map<string, PlannerSlot>();
        const add = (
            time: string,
            venueId: number,
            durationMinutes: number,
        ) => {
            const s = {
                scopeKey: d.scopeKey,
                roundNumber: d.roundNumber,
                date: d.date,
                time,
                venueId,
                durationMinutes,
            };
            slots.set(plannerSlotKey(s), { ...s, key: plannerSlotKey(s) });
        };
        for (const m of this.scopedMatches())
            for (const r of [calendarDraftRow(m), this.row(m)]) {
                if (
                    plannerAssigned(r) &&
                    r.roundNumber === d.roundNumber &&
                    r.date === d.date
                )
                    add(r.time, r.venueId, r.durationMinutes);
            }
        const custom = this.customSlots().filter(
            (s) => plannerDayKey(s.scopeKey, s.roundNumber, s.date) === d.key,
        );
        for (const s of custom) slots.set(s.key, s);
        // A compact initial grid; retain exact non-standard existing starts and durations.
        if (!custom.length) {
            const start =
                [...slots.values()].map((s) => s.time).sort()[0] ?? '18:00';
            for (let i = 0; i < 4; i++) {
                const t = shiftCalendarTime(
                    d.date,
                    start,
                    i * this.defaultDuration(),
                );
                if (!t || t.date !== d.date) break;
                for (const venue of this.visibleVenues())
                    if (
                        ![...slots.values()].some(
                            (s) => s.time === t.time && s.venueId === venue.id,
                        )
                    )
                        add(t.time, venue.id, this.defaultDuration());
            }
        }
        return [...slots.values()];
    });
    readonly times = computed(() =>
        [...new Set(this.slots().map((s) => s.time))].sort(),
    );
    formRound: number | null = null;
    formDate = '';
    formTime = '18:00';
    formDuration = 75;
    formCount = 4;
    formVenue = 0;
    formVenues: number[] = [];
    moveDayMatches = false;
    private editingDay?: PlannerDay;
    private editingSlot?: PlannerSlot;
    ngOnChanges(changes: SimpleChanges) {
        if (changes['calendar'] && !changes['calendar'].firstChange) {
            // A different tournament or a server reload must not inherit an old working grid.
            this.customSlots.set([]);
            this.additionalDays.set([]);
            this.scopeSelection.set('');
            this.daySelection.set('');
            this.picked.set(null);
            this.feedback.set('');
            this.closeEditor();
        }
    }
    readonly bankTarget: DropTarget = { kind: 'bank' };
    dayTarget(day: PlannerDay): DropTarget {
        return { kind: 'day', day };
    }
    slotTarget(slot: PlannerSlot): DropTarget {
        return { kind: 'slot', slot };
    }

    row(m: CalendarMatch) {
        return plannerRow(m, this.drafts());
    }
    plannerScopeKeyFor(m: CalendarMatch) {
        return plannerScopeKey(m);
    }
    matchEnd(m: CalendarMatch) {
        const r = this.row(m);
        const end = shiftCalendarTime(r.date, r.time, r.durationMinutes);
        return end ? end.time + (end.date !== r.date ? ' (+1 день)' : '') : '—';
    }
    canEditFormRound() {
        const m = this.editorMatch();
        return m
            ? !!m.canChangeRound
            : this.scopedMatches().some((m) => m.canChangeRound);
    }
    canUseUnnumberedRound() {
        const match = this.editorMatch();
        if (match) return this.row(match).roundNumber === null;
        if (this.editor() === 'slot')
            return (this.editingSlot ?? this.day())?.roundNumber === null;
        return (this.editingDay ?? this.day())?.roundNumber === null;
    }
    editable(m: CalendarMatch) {
        return m.status === 'scheduled' && !this.disabled();
    }
    changed(m: CalendarMatch) {
        return (
            JSON.stringify(this.row(m)) !== JSON.stringify(calendarDraftRow(m))
        );
    }
    dayCount(d: PlannerDay) {
        return this.scopedMatches().filter((m) => {
            const r = this.row(m);
            return (
                r.roundNumber === d.roundNumber &&
                (d.date
                    ? r.date === d.date && plannerAssigned(r)
                    : !plannerAssigned(r))
            );
        }).length;
    }
    dateLabel(date: string) {
        return date ? date.split('-').reverse().join('.') : 'Дата уточняется';
    }
    slot(time: string, venueId: number): PlannerSlot {
        const d = this.day()!;
        return (
            this.slots().find(
                (s) => s.time === time && s.venueId === venueId,
            ) ?? {
                key: `${d.key}|${venueId}|${time}`,
                scopeKey: d.scopeKey,
                roundNumber: d.roundNumber,
                date: d.date,
                time,
                venueId,
                durationMinutes: this.defaultDuration(),
            }
        );
    }
    occupants(s: PlannerSlot) {
        return plannerOccupants(this.calendar().matches, this.drafts(), s);
    }
    blockedSlot(s: PlannerSlot) {
        return this.occupants(s).some(
            (m) => !this.editable(m) || plannerScopeKey(m) !== s.scopeKey,
        );
    }
    problem(m: CalendarMatch) {
        return (
            this.overlaps().has(m.id) ||
            this.issues().some(
                (i) => i.matchId === m.id || i.otherMatchId === m.id,
            )
        );
    }
    matchLocation(m: CalendarMatch) {
        const r = this.row(m);
        return plannerAssigned(r)
            ? `${r.roundNumber ? 'Тур ' + r.roundNumber + ' · ' : ''}${this.dateLabel(r.date)} · ${r.time} · ${this.calendar().venues.find((v) => v.id === r.venueId)?.name ?? 'Площадка'}`
            : `${r.roundNumber ? 'Тур ' + r.roundNumber + ' · ' : ''}Дата уточняется`;
    }
    slotEnd(s: PlannerSlot) {
        return (
            shiftCalendarTime(s.date, s.time, s.durationMinutes)?.time ?? '—'
        );
    }
    chooseScope(key: string) {
        this.scopeSelection.set(key);
        this.daySelection.set('');
        this.picked.set(null);
        this.feedback.set('');
        this.roundChange.emit('');
    }
    chooseDay(day: PlannerDay) {
        this.daySelection.set(day.key);
        this.roundChange.emit(String(day.roundNumber ?? ''));
    }
    pick(m: CalendarMatch) {
        if (!this.editable(m)) return;
        this.picked.set(this.picked() === m.id ? null : m.id);
        this.message(
            this.picked()
                ? `Выбран матч «${m.home} — ${m.away}». Выберите день слева и нажмите нужный слот.`
                : 'Выбор отменён.',
        );
    }
    private message(text: string, error = false) {
        this.feedback.set(text);
        this.feedbackError.set(error);
    }
    readonly canEnter = (
        drag: CdkDrag<CalendarMatch>,
        list: CdkDropList<DropTarget>,
    ) => {
        const m = drag.data,
            t = list.data;
        if (!m || !this.editable(m) || plannerScopeKey(m) !== this.scope()?.key)
            return false;
        if (t.kind === 'slot') return !this.blockedSlot(t.slot);
        return true;
    };
    dropped(event: CdkDragDrop<DropTarget, DropTarget, CalendarMatch>) {
        if (!event.isPointerOverContainer) return;
        const m = event.item.data,
            target = event.container.data;
        if (!m || !this.editable(m)) return;
        if (target.kind === 'slot') this.assign(m.id, target.slot);
        if (target.kind === 'bank') this.unschedule(m);
        if (target.kind === 'day') {
            this.chooseDay(target.day);
            this.picked.set(m.id);
            this.bankFilter.set('all');
            this.message(
                `Выбран ${target.day.label}. Теперь нажмите нужное время в сетке — матч пока не перенесён.`,
            );
            if (!target.day.date) this.openDayEditor();
        }
    }
    useSlot(s: PlannerSlot) {
        const picked = this.picked();
        if (picked) this.assign(picked, s);
        else this.openSlotEditor(s);
    }
    assign(id: number, s: PlannerSlot, confirmed = false) {
        if (this.disabled()) return;
        const plan = plannerAssign(
            this.calendar().matches,
            this.drafts(),
            id,
            s,
            confirmed,
        );
        if (plan.error) {
            this.message(plan.error, true);
            this.editorError.set(plan.error);
            return;
        }
        if (plan.occupied) {
            this.swap.set({ id, other: plan.occupied, slot: s });
            this.openEditor('swap');
            return;
        }
        this.rowsChange.emit(plan.rows);
        this.picked.set(null);
        this.closeEditor();
        this.message(
            `Назначение изменено в черновике: ${this.dateLabel(s.date)} · ${s.time}. Для публикации проверьте и сохраните календарь.`,
        );
    }
    confirmSwap() {
        const swap = this.swap();
        if (swap) this.assign(swap.id, swap.slot, true);
    }
    sourceAssigned() {
        const m = this.calendar().matches.find((m) => m.id === this.swap()?.id);
        return !!m && plannerAssigned(this.row(m));
    }
    swapMatch() {
        return this.calendar().matches.find((m) => m.id === this.swap()?.id);
    }
    unschedule(m: CalendarMatch) {
        if (!this.editable(m) || !plannerAssigned(this.row(m))) return;
        this.rowsChange.emit([
            { ...this.row(m), date: '', time: '', venueId: 0, postponed: true },
        ]);
        this.message(
            `«${m.home} — ${m.away}» возвращён в список без даты. Изменение ещё не сохранено.`,
        );
        this.bankFilter.set('unscheduled');
        this.picked.set(null);
        this.closeEditor();
    }
    openDayEditor(create = false) {
        const d = this.day();
        if (!d || this.disabled()) return;
        this.editingDay = create ? undefined : d;
        this.formRound = d.roundNumber;
        this.formDate = create ? '' : d.date;
        this.formTime = this.times()[0] ?? '18:00';
        this.formDuration = this.defaultDuration();
        this.formCount = 4;
        this.formVenues = this.visibleVenues().map((v) => v.id);
        this.moveDayMatches = !create && !!d.date;
        this.openEditor('day');
    }
    openSlotEditor(s?: PlannerSlot) {
        const d = this.day();
        if (!d || this.disabled()) return;
        this.editingSlot = s;
        this.formRound = s?.roundNumber ?? d.roundNumber;
        this.formDate = s?.date ?? d.date;
        this.formTime =
            s?.time ??
            (this.times().length
                ? (shiftCalendarTime(
                      d.date,
                      this.times().at(-1)!,
                      this.defaultDuration(),
                  )?.time ?? '18:00')
                : '18:00');
        this.formDuration = s?.durationMinutes ?? this.defaultDuration();
        this.formVenue = s?.venueId ?? this.visibleVenues()[0]?.id ?? 0;
        this.openEditor('slot');
    }
    openMatchEditor(m: CalendarMatch) {
        if (!this.editable(m)) return;
        const r = this.row(m);
        this.editorMatch.set(m);
        this.formRound = r.roundNumber;
        this.formDate = r.date;
        this.formTime = r.time || '18:00';
        this.formVenue = r.venueId || this.visibleVenues()[0]?.id || 0;
        this.formDuration =
            this.changed(m) || (m.scheduleRevision ?? 0) > 0
                ? r.durationMinutes
                : (m.defaultDurationMinutes ?? r.durationMinutes);
        this.openEditor('match');
    }
    private openEditor(kind: Editor) {
        this.editor.set(kind);
        this.editorError.set('');
        setTimeout(() => {
            const dialog = this.dialog()?.nativeElement;
            if (this.editor() && dialog && !dialog.open) dialog.showModal();
        });
    }
    closeEditor() {
        this.dialog()?.nativeElement.close();
        this.editor.set(null);
        this.swap.set(null);
        this.editorMatch.set(null);
        this.editorError.set('');
    }
    onCancel(event: Event) {
        event.preventDefault();
        this.closeEditor();
    }
    toggleVenue(id: number, checked: boolean) {
        this.formVenues = checked
            ? [...new Set([...this.formVenues, id])]
            : this.formVenues.filter((v) => v !== id);
    }
    roundChoices() {
        return [
            ...new Set(
                this.scopedMatches()
                    .map((m) => m.roundNumber)
                    .filter((n): n is number => !!n),
            ),
        ].sort((a, b) => a - b);
    }
    private formSlot(venueId: number, time = this.formTime): PlannerSlot {
        const s = {
            scopeKey: this.scope()!.key,
            roundNumber: this.formRound,
            date: this.formDate,
            time,
            venueId,
            durationMinutes: Number(this.formDuration),
        };
        return { ...s, key: plannerSlotKey(s) };
    }
    applyEditor() {
        if (this.disabled()) return;
        this.editorError.set('');
        if (
            !shiftCalendarTime(this.formDate, this.formTime, 0) ||
            !Number.isInteger(Number(this.formDuration)) ||
            this.formDuration < 1 ||
            this.formDuration > 480
        ) {
            this.editorError.set(
                'Укажите корректные дату, время и длительность слота от 1 до 480 минут.',
            );
            return;
        }
        if (
            (this.formRound === null && !this.canUseUnnumberedRound()) ||
            (this.formRound !== null &&
                !this.roundChoices().includes(Number(this.formRound)))
        ) {
            this.editorError.set('Выберите существующий тур этой группы.');
            return;
        }
        if (this.editor() === 'match') {
            if (
                !this.calendar().venues.some(
                    (v) => v.id === Number(this.formVenue),
                )
            ) {
                this.editorError.set('Выберите площадку.');
                return;
            }
            const m = this.editorMatch();
            if (m) this.assign(m.id, this.formSlot(Number(this.formVenue)));
            return;
        }
        if (this.editor() === 'slot') {
            if (
                !this.calendar().venues.some(
                    (v) => v.id === Number(this.formVenue),
                )
            ) {
                this.editorError.set('Выберите площадку.');
                return;
            }
            const slot = this.formSlot(Number(this.formVenue)),
                old = this.editingSlot;
            const occupants = old ? this.occupants(old) : [];
            if (
                occupants.length > 1 ||
                occupants.some(
                    (m) =>
                        !this.editable(m) ||
                        plannerScopeKey(m) !== slot.scopeKey,
                )
            ) {
                this.editorError.set(
                    'Этот слот нельзя изменить: он занят начатым матчем или встречей другой группы.',
                );
                return;
            }
            if (occupants.length) {
                this.assign(occupants[0].id, slot);
                if (this.editor() === 'swap' || this.editorError()) return;
            }
            this.rememberSlots([slot], old?.key);
            this.navigateSlot(slot);
            this.closeEditor();
            this.message(
                'Слот изменён в рабочей сетке. Назначения матчей сохраняются общей кнопкой.',
            );
            return;
        }
        if (this.editor() === 'day') {
            if (
                !Number.isInteger(Number(this.formCount)) ||
                this.formCount < 1 ||
                this.formCount > 24 ||
                !this.formVenues.length ||
                this.formVenues.some(
                    (id) => !this.calendar().venues.some((v) => v.id === id),
                )
            ) {
                this.editorError.set(
                    'Выберите площадки и от 1 до 24 временных слотов.',
                );
                return;
            }
            const generated: PlannerSlot[] = [];
            for (let i = 0; i < this.formCount; i++) {
                const t = shiftCalendarTime(
                    this.formDate,
                    this.formTime,
                    i * Number(this.formDuration),
                );
                if (!t || t.date !== this.formDate) {
                    this.editorError.set(
                        'Слоты выходят за пределы дня. Уменьшите их число или добавьте другой день.',
                    );
                    return;
                }
                for (const venue of this.formVenues)
                    generated.push(this.formSlot(venue, t.time));
            }
            const old = this.editingDay,
                affected = old
                    ? this.scopedMatches().filter((m) => {
                          const r = this.row(m);
                          return (
                              plannerAssigned(r) &&
                              r.roundNumber === old.roundNumber &&
                              r.date === old.date
                          );
                      })
                    : [];
            if (
                this.moveDayMatches &&
                affected.length &&
                (old?.date !== this.formDate ||
                    old.roundNumber !== this.formRound)
            ) {
                if (
                    affected.some(
                        (m) =>
                            !this.editable(m) ||
                            (this.row(m).roundNumber !== this.formRound &&
                                !m.canChangeRound),
                    )
                ) {
                    this.editorError.set(
                        'В дне есть начатые матчи или фиксированные раунды. Создайте новый день без переноса этих игр.',
                    );
                    return;
                }
                this.rowsChange.emit(
                    affected.map((m) => ({
                        ...this.row(m),
                        date: this.formDate,
                        roundNumber: this.formRound,
                    })),
                );
            }
            this.rememberSlots(generated);
            this.navigateSlot(generated[0]);
            this.closeEditor();
            this.message(
                'Рабочая сетка готова. Перетащите матчи в слоты, затем проверьте и сохраните назначения.',
            );
        }
    }
    private rememberSlots(slots: PlannerSlot[], removeKey?: string) {
        this.customSlots.update((current) => [
            ...new Map(
                [...current.filter((s) => s.key !== removeKey), ...slots].map(
                    (s) => [s.key, s],
                ),
            ).values(),
        ]);
        this.additionalDays.update((days) => [
            ...new Map(
                [
                    ...days,
                    ...slots.map((s) => ({
                        key: plannerDayKey(s.scopeKey, s.roundNumber, s.date),
                        scopeKey: s.scopeKey,
                        roundNumber: s.roundNumber,
                        date: s.date,
                        label: s.roundNumber
                            ? `${s.roundNumber} тур`
                            : 'Матчи этапа',
                    })),
                ].map((d) => [d.key, d]),
            ).values(),
        ]);
    }
    private navigateSlot(s: PlannerSlot) {
        const d = {
            key: plannerDayKey(s.scopeKey, s.roundNumber, s.date),
            scopeKey: s.scopeKey,
            roundNumber: s.roundNumber,
            date: s.date,
            label: s.roundNumber ? `${s.roundNumber} тур` : 'Матчи этапа',
        };
        this.chooseDay(d);
    }
    focusMatch(m: CalendarMatch) {
        this.scopeSelection.set(plannerScopeKey(m));
        const r = this.row(m);
        this.daySelection.set(
            plannerDayKey(
                plannerScopeKey(m),
                r.roundNumber,
                plannerAssigned(r) ? r.date : '',
            ),
        );
        this.roundChange.emit(String(r.roundNumber ?? ''));
        this.bankFilter.set('all');
        this.search.set('');
        this.picked.set(m.id);
        requestAnimationFrame(() =>
            document
                .getElementById(`planner-bank-match-${m.id}`)
                ?.scrollIntoView({ block: 'nearest' }),
        );
    }
}
