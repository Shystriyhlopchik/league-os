import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CalendarImportComponent } from './calendar-import.component';
import { CalendarImportPreview } from '../../../entities/tournament-application/calendar-import.types';

describe('CalendarImportComponent', () => {
    let fixture: ComponentFixture<CalendarImportComponent>;
    let component: CalendarImportComponent;
    let http: HttpTestingController;
    const base = '/api/tournaments/22/stages/31/schedule/import';
    const preview = (): CalendarImportPreview => {
        const row = {
            row: 2,
            group: 'А',
            roundNumber: 1,
            home: 'Водоканал',
            away: 'КРИКС',
            date: '01.11.2026',
            time: '15:00',
            venue: 'Спартак',
        };
        return {
            valid: true,
            version: 'a'.repeat(64),
            sourceRows: [row],
            rows: [
                {
                    ...row,
                    action: 'add',
                    errors: [],
                    warnings: [],
                    matchDatetime: '2026-11-01T15:00:00',
                },
            ],
            sources: [
                { kind: 'group', source: 'А', id: 1 },
                { kind: 'team', source: 'Водоканал', id: 101 },
                { kind: 'team', source: 'КРИКС', id: 102 },
                { kind: 'venue', source: 'Спартак', id: 5 },
            ],
            references: {
                groups: [{ id: 1, key: 'А', name: 'Группа А' }],
                teams: [
                    { id: 101, name: 'Водоканал', groupId: 1 },
                    { id: 102, name: 'КРИКС', groupId: 1 },
                ],
                venues: [{ id: 5, name: 'Спартак' }],
            },
            errors: [],
            warnings: [],
            createCount: 1,
            skipCount: 0,
            cancelCount: 0,
            expectedMatches: 1,
            totalAfterImport: 1,
        };
    };
    const upload = (file: File) =>
        component.readFile({
            target: { files: [file], value: file.name },
        } as unknown as Event);
    const load = async () => {
        const pending = upload(new File(['xlsx'], 'calendar.xlsx'));
        const request = http.expectOne(`${base}/read`);
        expect(request.request.body instanceof FormData).toBeTrue();
        request.flush(preview());
        await pending;
        fixture.detectChanges();
    };
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CalendarImportComponent],
            providers: [provideHttpClient(), provideHttpClientTesting()],
        }).compileComponents();
        fixture = TestBed.createComponent(CalendarImportComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('tournamentId', 22);
        fixture.componentRef.setInput('stageId', 31);
        http = TestBed.inject(HttpTestingController);
        fixture.detectChanges();
    });
    afterEach(() => http.verify());
    it('uploads a file and displays a preview without committing it', async () => {
        await load();
        expect(fixture.nativeElement.textContent).toContain(
            'Предпросмотр: calendar.xlsx',
        );
        expect(fixture.nativeElement.textContent).toContain(
            'Водоканал — КРИКС',
        );
        http.expectNone(`${base}/confirm`);
    });
    it('downloads the tournament-specific template', async () => {
        spyOn(URL, 'createObjectURL').and.returnValue('blob:template');
        spyOn(URL, 'revokeObjectURL');
        spyOn(HTMLAnchorElement.prototype, 'click');
        const pending = component.downloadTemplate();
        const request = http.expectOne(`${base}/template`);
        expect(request.request.responseType).toBe('blob');
        request.flush(new Blob(['xlsx']));
        await pending;
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:template');
    });
    it('requires a new preview after changing mappings', async () => {
        await load();
        component.changeMapping('team', 'КРИКС', 102);
        await component.confirm();
        http.expectNone(`${base}/confirm`);
        expect(component.needsCheck()).toBeTrue();
        const pending = component.check();
        const request = http.expectOne(`${base}/preview`);
        expect(request.request.body.mappings).toContain({
            kind: 'team',
            source: 'КРИКС',
            id: 102,
        });
        request.flush(preview());
        await pending;
        expect(component.needsCheck()).toBeFalse();
    });
    it('requires separate confirmation for replacement and sends the checked version', async () => {
        await load();
        component.mode = 'replace';
        component.invalidate();
        const checking = component.check();
        http.expectOne(`${base}/preview`).flush(preview());
        await checking;
        await component.confirm();
        http.expectNone(`${base}/confirm`);
        component.replaceConfirmed = true;
        const emitted = jasmine.createSpy('imported');
        component.calendarImported.subscribe(emitted);
        const pending = component.confirm();
        const request = http.expectOne(`${base}/confirm`);
        expect(request.request.body.expectedVersion).toBe('a'.repeat(64));
        expect(request.request.body.confirmation).toBe(
            'REPLACE_PREPARED_SCHEDULE',
        );
        request.flush({
            createdMatches: 1,
            skippedMatches: 0,
            cancelledMatches: 2,
        });
        await pending;
        expect(emitted).toHaveBeenCalled();
        expect(component.preview()).toBeNull();
        expect(component.notice()).toContain('Добавлено: 1');
    });
    it('blocks invalid previews and exposes row-level diagnostics', async () => {
        const pending = upload(new File(['xlsx'], 'calendar.xlsx'));
        http.expectOne(`${base}/read`).flush({
            ...preview(),
            valid: false,
            errors: [{ row: 2, message: 'Команда не определена' }],
        });
        await pending;
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
            'Строка 2: Команда не определена',
        );
        await component.confirm();
        http.expectNone(`${base}/confirm`);
    });
    it('keeps the preview and requires rechecking after a concurrent calendar change', async () => {
        await load();
        const pending = component.confirm();
        http.expectOne(`${base}/confirm`).flush(
            { message: 'Календарь изменился. Повторите проверку' },
            { status: 409, statusText: 'Conflict' },
        );
        await pending;
        expect(component.error()).toContain('Календарь изменился');
        expect(component.preview()).not.toBeNull();
        expect(component.needsCheck()).toBeTrue();
        expect(component.busy()).toBeFalse();
    });
    it('rejects unsupported or oversized files before upload', async () => {
        await upload(new File(['csv'], 'calendar.csv'));
        expect(component.error()).toContain('.xlsx');
        await upload(
            new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.xlsx'),
        );
        expect(component.error()).toContain('5 МБ');
        http.expectNone(`${base}/read`);
    });
    it('respects the parent launch and unsaved-group lock', async () => {
        fixture.componentRef.setInput('disabled', true);
        await upload(new File(['xlsx'], 'calendar.xlsx'));
        await component.downloadTemplate();
        http.expectNone(`${base}/read`);
        http.expectNone(`${base}/template`);
    });
});
