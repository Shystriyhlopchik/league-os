import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { ManagedCalendar } from '../../entities/tournament-application/tournament-application.api';
import { CalendarDesktopPlannerComponent } from './calendar-desktop-planner.component';
import { CalendarDraftRow, calendarDraftRow } from './calendar-draft';
import { plannerDayKey } from './calendar-planner.model';

describe('Desktop calendar planner', () => {
    let fixture: ComponentFixture<CalendarDesktopPlannerComponent>,
        component: CalendarDesktopPlannerComponent;
    let calendar: ManagedCalendar,
        rows: Record<number, CalendarDraftRow>,
        emitted: CalendarDraftRow[][];
    const flush = async () => {
        fixture.detectChanges();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await fixture.whenStable();
        fixture.detectChanges();
    };
    beforeEach(async () => {
        calendar = {
            tournament: { name: 'Лига', lifecycleStatus: 'in_progress' },
            stages: [{ id: 1, name: 'Группы', type: 'group_stage' }],
            venues: [
                { id: 3, name: 'ФСК Восток' },
                { id: 4, name: 'Спартак' },
            ],
            matches: [
                {
                    id: 1,
                    home: 'Арман',
                    away: 'Полено',
                    status: 'scheduled',
                    stageId: 1,
                    groupId: 1,
                    groupName: 'А',
                    roundNumber: 1,
                    canChangeRound: true,
                    postponed: true,
                    matchDatetime: null,
                    defaultDurationMinutes: 55,
                },
                {
                    id: 2,
                    home: 'Соляное',
                    away: 'Голд',
                    status: 'scheduled',
                    stageId: 1,
                    groupId: 1,
                    groupName: 'А',
                    roundNumber: 1,
                    canChangeRound: true,
                    matchDatetime: '2030-11-20T19:15:00',
                    venueId: 3,
                    durationMinutes: 75,
                },
                {
                    id: 3,
                    home: 'ЧЭТК',
                    away: 'ЧТСиГХ',
                    status: 'scheduled',
                    stageId: 1,
                    groupId: 1,
                    groupName: 'А',
                    roundNumber: 2,
                    canChangeRound: true,
                    matchDatetime: '2030-11-27T18:00:00',
                    venueId: 4,
                    durationMinutes: 60,
                },
            ],
        };
        rows = Object.fromEntries(
            calendar.matches.map((m) => [m.id, calendarDraftRow(m)]),
        );
        emitted = [];
        await TestBed.configureTestingModule({
            imports: [CalendarDesktopPlannerComponent],
        }).compileComponents();
        fixture = TestBed.createComponent(CalendarDesktopPlannerComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('calendar', calendar);
        fixture.componentRef.setInput('drafts', rows);
        component.rowsChange.subscribe((changes) => {
            emitted.push(changes);
            rows = {
                ...rows,
                ...Object.fromEntries(changes.map((r) => [r.id, r])),
            };
            fixture.componentRef.setInput('drafts', rows);
        });
        component.roundChange.subscribe((round) =>
            fixture.componentRef.setInput('round', round),
        );
        await flush();
    });
    afterEach(() => component.closeEditor());
    it('links each drag to the actual list, including cards rendered through a shared template', () => {
        const drags = fixture.debugElement
            .queryAll(By.directive(CdkDrag))
            .map((el) => el.injector.get(CdkDrag));
        expect(drags.length).toBeGreaterThan(0);
        expect(drags.every((drag) => !!drag.dropContainer)).toBeTrue();
    });
    it('assigns a picked match to a free cell with date, time and rule duration', async () => {
        component.pick(calendar.matches[0]);
        component.useSlot(component.slot('20:10', 3));
        await flush();
        expect(rows[1]).toEqual(
            jasmine.objectContaining({
                date: '2030-11-20',
                time: '20:10',
                durationMinutes: 55,
                venueId: 3,
                postponed: false,
            }),
        );
        expect(component.picked()).toBeNull();
        expect(component.feedback()).toContain('черновике');
        expect(calendar.matches[0].postponed).toBeTrue();
    });
    it('confirms a swap and emits two changed rows together', async () => {
        component.assign(1, component.slot('19:15', 3));
        await flush();
        expect(component.editor()).toBe('swap');
        expect(fixture.nativeElement.querySelector('dialog').open).toBeTrue();
        expect(emitted.length).toBe(0);
        component.confirmSwap();
        await flush();
        expect(emitted[0].length).toBe(2);
        expect(rows[2].postponed).toBeTrue();
        expect(component.unscheduled().map((m) => m.id)).toContain(2);
    });
    it('cancelling a swap leaves every row unchanged', async () => {
        component.assign(1, component.slot('19:15', 3));
        await flush();
        component.closeEditor();
        expect(emitted.length).toBe(0);
    });
    it('adds another day with two venue columns without moving existing games', async () => {
        component.openDayEditor(true);
        expect(component.formDate).toBe('');
        expect(component.moveDayMatches).toBeFalse();
        component.formDate = '2030-11-22';
        component.formTime = '17:00';
        component.formVenues = [3, 4];
        component.formCount = 3;
        component.applyEditor();
        await flush();
        expect(emitted.length).toBe(0);
        expect(component.day()?.date).toBe('2030-11-22');
        expect(component.slots().length).toBe(6);
        expect(component.times()).toEqual(['17:00', '17:55', '18:50']);
        expect(component.visibleVenues().length).toBe(2);
        component.chooseDay(
            component.days().find((d) => d.date === '2030-11-20')!,
        );
        expect(component.dayMatches().map((m) => m.id)).toEqual([2]);
    });
    it('moves an entire day together, retaining individual times and venue', async () => {
        component.openDayEditor();
        component.formDate = '2030-11-23';
        component.applyEditor();
        await flush();
        expect(rows[2]).toEqual(
            jasmine.objectContaining({
                date: '2030-11-23',
                time: '19:15',
                venueId: 3,
                durationMinutes: 75,
            }),
        );
    });
    it('allows a cross-round move without changing sporting scope', async () => {
        component.chooseDay(component.days().find((d) => d.roundNumber === 2)!);
        await flush();
        component.assign(1, component.slot('19:00', 4));
        await flush();
        expect(rows[1].roundNumber).toBe(2);
        expect(rows[1].date).toBe('2030-11-27');
        component.chooseDay(component.days().find((d) => d.roundNumber === 1)!);
        expect(rows[1].roundNumber).toBe(2);
    });
    it('rejects invalid grid input with a visible message and no draft mutations', async () => {
        component.openDayEditor();
        component.formCount = 25;
        component.applyEditor();
        await flush();
        expect(component.editorError()).toContain('24');
        expect(emitted.length).toBe(0);
        expect(
            fixture.nativeElement.querySelector('[role="alert"]').textContent,
        ).toContain('24');
    });
    it('does not generate start times that wrap into another day', () => {
        component.openDayEditor();
        component.formTime = '23:30';
        component.formDuration = 75;
        component.formCount = 2;
        component.applyEditor();
        expect(component.editorError()).toContain('пределы дня');
        expect(component.customSlots()).toEqual([]);
    });
    it('supports explicit slot edits and retains them when navigating between days', async () => {
        component.openSlotEditor();
        component.formTime = '22:00';
        component.formDuration = 85;
        component.formVenue = 4;
        component.applyEditor();
        await flush();
        expect(
            component
                .slots()
                .some(
                    (s) =>
                        s.time === '22:00' &&
                        s.venueId === 4 &&
                        s.durationMinutes === 85,
                ),
        ).toBeTrue();
        const original = component.day()!;
        component.chooseDay(component.days().find((d) => d.roundNumber === 2)!);
        await flush();
        component.chooseDay(original);
        await flush();
        expect(component.slot('22:00', 4).durationMinutes).toBe(85);
    });
    it('returns a booking to the bank while retaining its round', async () => {
        component.unschedule(calendar.matches[1]);
        await flush();
        expect(rows[2]).toEqual(
            jasmine.objectContaining({
                roundNumber: 1,
                postponed: true,
                date: '',
                time: '',
                venueId: 0,
            }),
        );
        expect(component.unscheduled().map((m) => m.id)).toContain(2);
    });
    it('protects live games and locked editors from any draft mutation', async () => {
        calendar.matches[1].status = 'live';
        component.unschedule(calendar.matches[1]);
        component.openMatchEditor(calendar.matches[1]);
        component.openDayEditor();
        component.formDate = '2030-11-23';
        component.applyEditor();
        expect(component.editorError()).toContain('начатые');
        component.closeEditor();
        fixture.componentRef.setInput('disabled', true);
        await flush();
        component.assign(1, component.slot('21:00', 3));
        expect(emitted.length).toBe(0);
    });
    it('filters the bank by team without losing assignments', () => {
        component.bankFilter.set('all');
        component.search.set('чэтк');
        expect(component.bankMatches().map((m) => m.id)).toEqual([3]);
        expect(rows[2].time).toBe('19:15');
    });
    it('resets temporary slots on a new server calendar, not on draft changes', async () => {
        component.openSlotEditor();
        component.formTime = '22:00';
        component.applyEditor();
        await flush();
        expect(component.customSlots().length).toBe(1);
        component.unschedule(calendar.matches[1]);
        await flush();
        expect(component.customSlots().length).toBe(1);
        fixture.componentRef.setInput('calendar', { ...calendar });
        await flush();
        expect(component.customSlots()).toEqual([]);
        expect(component.additionalDays()).toEqual([]);
    });
    it('can navigate to an API error in another group', async () => {
        calendar.matches.push({ ...calendar.matches[2], id: 4, groupId: 2 });
        fixture.componentRef.setInput('calendar', { ...calendar });
        await flush();
        component.focusMatch(calendar.matches[3]);
        await flush();
        expect(component.scope()?.key).toBe('1:2');
        expect(component.day()?.key).toBe(
            plannerDayKey('1:2', 2, '2030-11-27'),
        );
        expect(component.picked()).toBe(4);
    });
});
