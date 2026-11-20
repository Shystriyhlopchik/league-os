import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
    ActivatedRoute,
    convertToParamMap,
    provideRouter,
    Router,
} from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CalendarManagementComponent } from './calendar-management.component';
import {
    ManagedCalendar,
    TournamentApplicationApi,
} from '../../entities/tournament-application/tournament-application.api';
import {
    CalendarBatchPreview,
    CalendarBatchResult,
} from '../../entities/tournament-application/calendar-batch.types';
import { shiftCalendarTime } from './calendar-draft';

describe('Batch calendar editor', () => {
    let fixture: ComponentFixture<CalendarManagementComponent>,
        component: CalendarManagementComponent;
    let api: jasmine.SpyObj<TournamentApplicationApi>,
        calendar: ManagedCalendar;
    const valid: CalendarBatchPreview = {
        valid: true,
        version: 'a'.repeat(64),
        replayed: false,
        updatedCount: 0,
        issues: [],
        warnings: [],
        changes: [],
    };
    beforeEach(async () => {
        calendar = {
            tournament: { name: 'Лига', lifecycleStatus: 'in_progress' },
            stages: [],
            venues: [{ id: 3, name: 'ФСК Восток' }],
            matches: [
                {
                    id: 7,
                    home: 'Водоканал',
                    away: 'КРИКС',
                    status: 'scheduled',
                    roundNumber: 1,
                    canChangeRound: true,
                    matchDatetime: '2030-11-20T18:00:00',
                    venueId: 3,
                    durationMinutes: 60,
                    scheduleRevision: 0,
                    defaultDurationMinutes: 55,
                    slotTiming: {
                        periods: 2,
                        periodDurationMinutes: 20,
                        changeoverMinutes: 15,
                    },
                },
                {
                    id: 8,
                    home: 'Соляное',
                    away: 'Арман голд',
                    status: 'scheduled',
                    roundNumber: 2,
                    canChangeRound: true,
                    matchDatetime: '2030-11-20T19:00:00',
                    venueId: 3,
                    durationMinutes: 75,
                    scheduleRevision: 1,
                },
                {
                    id: 9,
                    home: 'ЧЭТК',
                    away: 'ЧТСиГХ',
                    status: 'finished',
                    roundNumber: 1,
                    matchDatetime: '2030-11-19T18:00:00',
                    venueId: 3,
                },
            ],
        };
        api = jasmine.createSpyObj('TournamentApplicationApi', [
            'managedCalendars',
            'calendar',
            'previewCalendarBatch',
            'saveCalendarBatch',
        ]);
        api.managedCalendars.and.returnValue(of([{ id: 1, name: 'Лига' }]));
        api.calendar.and.returnValue(of(calendar));
        api.previewCalendarBatch.and.returnValue(of(valid));
        api.saveCalendarBatch.and.returnValue(
            of({ requestId: 'r', updatedCount: 1, replayed: false }),
        );
        await TestBed.configureTestingModule({
            imports: [CalendarManagementComponent],
            providers: [
                provideRouter([]),
                { provide: TournamentApplicationApi, useValue: api },
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: {
                            queryParamMap: convertToParamMap({
                                tournamentId: '1',
                            }),
                        },
                    },
                },
            ],
        }).compileComponents();
        spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
        fixture = TestBed.createComponent(CalendarManagementComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    });
    const flush = async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    };
    function change() {
        component.editField(calendar.matches[0], 'time', '20:00');
        component.reason = 'Новое время аренды';
    }
    it('starts clean, uses rule-derived slots and preserves custom slots', () => {
        expect(component.changed().length).toBe(0);
        expect(component.row(calendar.matches[0]).durationMinutes).toBe(60);
        component.editField(calendar.matches[0], 'time', '20:00');
        expect(component.row(calendar.matches[0]).durationMinutes).toBe(55);
        expect(component.row(calendar.matches[1]).durationMinutes).toBe(75);
        expect(fixture.nativeElement.textContent).toContain('2 × 20 + 15');
    });
    it('keeps the common draft while switching rounds and includes both rounds in one request', async () => {
        change();
        component.setRound('2');
        component.editField(calendar.matches[1], 'time', '21:00');
        expect(component.changed().length).toBe(2);
        await component.preview();
        expect(
            api.previewCalendarBatch.calls
                .mostRecent()
                .args[1].changes.map((m) => m.id),
        ).toEqual([7, 8]);
    });
    it('keeps moved rows visible in both source and destination until saved; date does not change', () => {
        component.setRound('1');
        component.editField(calendar.matches[0], 'roundNumber', 2);
        expect(component.matches().some((m) => m.id === 7)).toBeTrue();
        component.setRound('2');
        expect(component.matches().some((m) => m.id === 7)).toBeTrue();
        expect(component.row(calendar.matches[0]).date).toBe('2030-11-20');
    });
    it('does not change finished matches', () => {
        component.editField(calendar.matches[2], 'time', '22:00');
        expect(component.changed().length).toBe(0);
    });
    it('merges desktop swaps atomically and submits both rows together', async () => {
        const first = { ...component.row(calendar.matches[0]), time: '19:00' };
        const second = { ...component.row(calendar.matches[1]), time: '18:00' };
        component.applyPlannerRows([first, second]);
        component.reason = 'Обмен временными слотами';
        await component.preview();
        expect(
            api.previewCalendarBatch.calls
                .mostRecent()
                .args[1].changes.map((m) => m.id),
        ).toEqual([7, 8]);
        first.time = '23:00';
        expect(component.row(calendar.matches[0]).time).toBe('19:00');
    });
    it('rejects an entire desktop patch when one row is immutable', () => {
        component.applyPlannerRows([
            { ...component.row(calendar.matches[0]), time: '21:00' },
            { ...component.row(calendar.matches[2]), time: '21:00' },
        ]);
        expect(component.changed().length).toBe(0);
        expect(component.error()).toContain('нельзя переносить');
    });
    it('shows required-field errors before sending anything', async () => {
        component.editField(calendar.matches[0], 'date', '');
        await component.preview();
        await flush();
        expect(api.previewCalendarBatch).not.toHaveBeenCalled();
        expect(
            fixture.nativeElement.querySelector('[role="alert"]').textContent,
        ).toContain('Проверьте');
        expect(
            fixture.nativeElement.querySelectorAll('[aria-invalid="true"]')
                .length,
        ).toBeGreaterThan(0);
    });
    it('validates slot bounds', async () => {
        for (const value of [0, 481, 1.5, NaN]) {
            change();
            component.editField(calendar.matches[0], 'durationMinutes', value);
            await component.preview();
            expect(component.fieldIssue(7, 'durationMinutes')).toBeTrue();
        }
        expect(api.previewCalendarBatch).not.toHaveBeenCalled();
    });
    it('requires review and only then sends one atomic request', async () => {
        change();
        await component.preview();
        expect(api.saveCalendarBatch).not.toHaveBeenCalled();
        await component.save();
        expect(api.saveCalendarBatch).toHaveBeenCalledTimes(1);
        expect(api.saveCalendarBatch.calls.mostRecent().args[1]).toEqual(
            jasmine.objectContaining({
                expectedVersion: valid.version,
                reason: 'Новое время аренды',
            }),
        );
        expect(component.notice()).toContain('Календарь сохранён');
        expect(component.changed().length).toBe(0);
    });
    it('keeps drafts and highlights all server conflicts', async () => {
        api.previewCalendarBatch.and.returnValue(
            of({
                ...valid,
                valid: false,
                issues: [
                    {
                        matchId: 7,
                        otherMatchId: 8,
                        field: 'matchDatetime',
                        message: 'Площадка занята',
                    },
                ],
            }),
        );
        change();
        await component.preview();
        await flush();
        expect(component.changed().length).toBe(1);
        expect(component.review()).toBeNull();
        expect(component.fieldIssue(7, 'matchDatetime')).toBeTrue();
        expect(component.fieldIssue(8, 'matchDatetime')).toBeTrue();
        expect(fixture.nativeElement.textContent).toContain('Площадка занята');
    });
    it('uses the same request ID when repeating an unconfirmed save', async () => {
        change();
        await component.preview();
        api.saveCalendarBatch.and.returnValue(
            throwError(() => ({ status: 0 })),
        );
        await component.save();
        const first = api.saveCalendarBatch.calls.mostRecent().args[1];
        expect(component.changed().length).toBe(1);
        expect(component.review()).not.toBeNull();
        await component.save();
        expect(api.saveCalendarBatch.calls.mostRecent().args[1].requestId).toBe(
            first.requestId,
        );
        expect(component.error()).toContain('Нет подтверждения');
    });
    it('requires a fresh review after modifying checked fields', async () => {
        change();
        await component.preview();
        component.editField(calendar.matches[0], 'time', '21:00');
        await component.save();
        expect(api.saveCalendarBatch).not.toHaveBeenCalled();
        expect(component.review()).toBeNull();
    });
    it('prevents duplicate clicks while saving', async () => {
        change();
        await component.preview();
        const response = new Subject<CalendarBatchResult>();
        api.saveCalendarBatch.and.returnValue(response);
        const saving = component.save();
        await component.save();
        expect(api.saveCalendarBatch).toHaveBeenCalledTimes(1);
        response.next({ requestId: 'r', updatedCount: 1, replayed: false });
        response.complete();
        await saving;
        expect(component.busy()).toBeFalse();
    });
    it('reports successful commit separately from failed refresh and blocks stale edits', async () => {
        change();
        await component.preview();
        api.calendar.and.returnValue(throwError(() => new Error('refresh')));
        await component.save();
        expect(component.notice()).toContain('Календарь сохранён');
        expect(component.error()).toContain('список не обновился');
        expect(component.needsRefresh()).toBeTrue();
        component.editField(calendar.matches[0], 'time', '23:00');
        expect(component.changed().length).toBe(0);
    });
    it('can explicitly postpone without requiring date or venue', async () => {
        component.editField(calendar.matches[0], 'postponed', true);
        component.reason = 'Площадка закрыта';
        await component.preview();
        expect(
            api.previewCalendarBatch.calls.mostRecent().args[1].changes[0],
        ).toEqual(jasmine.objectContaining({ postponed: true }));
        expect(
            api.previewCalendarBatch.calls.mostRecent().args[1].changes[0]
                .matchDatetime,
        ).toBeUndefined();
    });
    it('sequences selected slots using each duration, in row order', () => {
        component.selected.set([8, 7]);
        component.bulkDate = '2030-11-21';
        component.bulkVenueId = 3;
        component.startTime = '18:00';
        component.bulkSequence();
        expect(component.row(calendar.matches[0]).time).toBe('18:00');
        expect(component.row(calendar.matches[1]).time).toBe('18:55');
    });
    it('shifts across midnight without depending on browser timezone', () => {
        component.editField(calendar.matches[0], 'time', '23:50');
        component.selected.set([7]);
        component.shiftMinutes = 20;
        component.bulkShift();
        expect(component.row(calendar.matches[0])).toEqual(
            jasmine.objectContaining({ date: '2030-11-21', time: '00:10' }),
        );
        expect(shiftCalendarTime('2030-02-30', '18:00', 15)).toBeNull();
        expect(shiftCalendarTime('2030-02-01', '25:00', 15)).toBeNull();
    });
    it('does not lose the draft when leaving is cancelled', async () => {
        change();
        spyOn(window, 'confirm').and.returnValue(false);
        await component.switchTournament(2);
        expect(component.tournamentId).toBe(1);
        expect(component.changed().length).toBe(1);
        expect(component.canLeave()).toBeFalse();
    });
    it('retains downloaded-data candidates on revision conflicts and requires rechecking', async () => {
        change();
        await component.preview();
        api.saveCalendarBatch.and.returnValue(
            throwError(() => ({
                status: 409,
                error: { message: 'Календарь изменён' },
            })),
        );
        await component.save();
        expect(component.changed().length).toBe(1);
        expect(component.review()).toBeNull();
        expect(component.error()).toBe('Календарь изменён');
    });
});
