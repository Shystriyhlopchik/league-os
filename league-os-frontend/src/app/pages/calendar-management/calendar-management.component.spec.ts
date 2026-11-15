import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CalendarManagementComponent } from './calendar-management.component';
import { ManagedCalendar, TournamentApplicationApi } from '../../entities/tournament-application/tournament-application.api';

describe('Calendar management feedback and default slot', () => {
    let fixture: ComponentFixture<CalendarManagementComponent>;
    let component: CalendarManagementComponent;
    let api: jasmine.SpyObj<TournamentApplicationApi>;
    let calendar: ManagedCalendar;

    beforeEach(async () => {
        calendar = {
            tournament: { name: 'Лига', lifecycleStatus: 'in_progress' },
            stages: [], venues: [{ id: 3, name: 'ФСК Восток' }],
            matches: [{ id: 7, home: 'Водоканал', away: 'КРИКС', status: 'scheduled',
                matchDatetime: '2026-11-20T12:00:00', venueId: 3, durationMinutes: 60,
                scheduleRevision: 0, defaultDurationMinutes: 55,
                slotTiming: { periods: 2, periodDurationMinutes: 20, changeoverMinutes: 15 } }],
        };
        api = jasmine.createSpyObj('TournamentApplicationApi', ['managedCalendars', 'calendar', 'schedule']);
        api.managedCalendars.and.returnValue(of([{ id: 1, name: 'Лига' }]));
        api.calendar.and.returnValue(of(calendar));
        api.schedule.and.returnValue(of({}));
        await TestBed.configureTestingModule({
            imports: [CalendarManagementComponent],
            providers: [provideRouter([]),
                { provide: TournamentApplicationApi, useValue: api },
                { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ tournamentId: '1' }) } } },
            ],
        }).compileComponents();
        spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
        fixture = TestBed.createComponent(CalendarManagementComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        await fixture.whenStable();
        component.edit(calendar.matches[0]);
        component.reason = 'Уточнено время начала';
        fixture.detectChanges();
        await fixture.whenStable();
    });

    it('uses tournament playing time plus 15 minutes instead of the initial DB default', () => {
        expect(component.duration).toBe(55);
        expect(fixture.nativeElement.textContent).toContain('2 × 20 + 15 = 55');
    });

    it('preserves a previously saved custom slot', () => {
        component.edit({ ...calendar.matches[0], scheduleRevision: 2, durationMinutes: 75 });
        expect(component.duration).toBe(75);
    });

    it('shows missing fields and does not silently ignore submit', async () => {
        component.datetime = '';
        component.venueId = 0;
        component.reason = '   ';
        await component.save(false);
        fixture.detectChanges();
        expect(api.schedule).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('проверьте');
        expect(fixture.nativeElement.querySelectorAll('[aria-invalid="true"]').length).toBe(3);
        expect(fixture.nativeElement.textContent).toContain('Укажите причину изменения');
    });

    it('validates the occupied slot before sending the request', async () => {
        for (const value of [0, 481, 1.5, NaN]) {
            component.duration = value;
            await component.save(false);
            expect(component.fieldErrors()['duration']).toBeTruthy();
        }
        expect(api.schedule).not.toHaveBeenCalled();
    });

    it('submits the form, saves the calculated slot and visibly reports success', async () => {
        const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
        expect(form.noValidate).toBeTrue();
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await fixture.whenStable();
        fixture.detectChanges();
        expect(api.schedule).toHaveBeenCalledWith(1, 7, '2026-11-20T12:00', 3,
            jasmine.objectContaining({ durationMinutes: 55, expectedRevision: 0 }));
        expect(fixture.nativeElement.querySelector('.feedback [role="status"]').textContent).toContain('успешно обновлено');
        expect(component.editing).toBeUndefined();
    });

    it('keeps the form and shows the server conflict message', async () => {
        api.schedule.and.returnValue(throwError(() => ({ status: 409, error: { message: 'Пересечение времени с матчем №12' } })));
        await component.save(false);
        fixture.detectChanges();
        expect(component.editing?.id).toBe(7);
        expect(component.busy()).toBeFalse();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('матчем №12');
    });

    it('renders validation arrays and network failures as understandable errors', async () => {
        api.schedule.and.returnValue(throwError(() => ({ error: { message: ['Ошибка даты', 'Ошибка площадки'] } })));
        await component.save(false);
        expect(component.error()).toBe('Ошибка даты. Ошибка площадки');
        api.schedule.and.returnValue(throwError(() => ({ status: 0 })));
        await component.save(false);
        expect(component.error()).toContain('Нет связи с сервером');
    });

    it('does not misreport a saved change when refreshing the list fails', async () => {
        api.calendar.and.returnValue(throwError(() => new Error('refresh failed')));
        await component.save(false);
        expect(component.notice()).toContain('успешно обновлено');
        expect(component.error()).toContain('Изменения сохранены');
        expect(component.editing).toBeUndefined();
    });

    it('shows saving state and prevents a duplicate click', async () => {
        const response = new Subject<object>();
        api.schedule.and.returnValue(response);
        const saving = component.save(false);
        fixture.detectChanges();
        expect(component.busy()).toBeTrue();
        expect(fixture.nativeElement.querySelector('button[type="submit"]').textContent).toContain('Сохранение');
        await component.save(false);
        expect(api.schedule).toHaveBeenCalledTimes(1);
        response.next({}); response.complete();
        await saving;
        expect(component.busy()).toBeFalse();
    });

    it('allows postponing without a date or venue and reports it', async () => {
        component.datetime = '';
        component.venueId = 0;
        await component.save(true);
        expect(api.schedule).toHaveBeenCalled();
        expect(component.notice()).toContain('Новая дата уточняется');
        component.dismissFeedback();
        expect(component.notice()).toBe('');
    });
});
