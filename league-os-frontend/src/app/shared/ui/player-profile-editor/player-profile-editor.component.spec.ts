import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import {
    PlayerCorrection,
    PlayerProfile,
    PlayerProfilesApi,
} from '../../../entities/player/api/player-profiles.api';
import { PlayerProfileEditorComponent } from './player-profile-editor.component';

describe('PlayerProfileEditorComponent', () => {
    let fixture: ComponentFixture<PlayerProfileEditorComponent>;
    let component: PlayerProfileEditorComponent;
    let api: jasmine.SpyObj<PlayerProfilesApi>;
    let view: PlayerProfile;
    beforeEach(async () => {
        view = {
            player: {
                id: 5,
                identityVersion: 1,
                firstName: 'Иван',
                lastName: 'Иванов',
                middleName: null,
                birthDate: '2000-01-01',
                photoUrl: '/old.jpg',
            },
            pending: false,
            changes: [],
            audit: [],
        };
        api = jasmine.createSpyObj<PlayerProfilesApi>('PlayerProfilesApi', [
            'profile',
            'submit',
            'photo',
        ]);
        api.profile.and.returnValue(of(view));
        api.submit.and.returnValue(
            of({
                id: 8,
                playerId: 5,
                communityId: 1,
                teamId: 3,
                requestedByUserId: 10,
                status: 'submitted',
                before: view.player,
                after: { ...view.player, firstName: 'Пётр' },
                reason: 'Опечатка',
                createdAt: '2026-11-04T10:00:00Z',
                reviewedByUserId: null,
                reviewedAt: null,
                comment: null,
            } as PlayerCorrection),
        );
        api.photo.and.returnValue(of({ photoUrl: '/new.jpg' }));
        await TestBed.configureTestingModule({
            imports: [PlayerProfileEditorComponent],
            providers: [{ provide: PlayerProfilesApi, useValue: api }],
        }).compileComponents();
        fixture = TestBed.createComponent(PlayerProfileEditorComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('communityId', 1);
        fixture.componentRef.setInput('playerId', 5);
        fixture.componentRef.setInput('teamId', 3);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    });
    it('loads the shared profile with explicit team context and does not start dirty', () => {
        expect(api.profile).toHaveBeenCalledWith(1, 5, 3);
        expect(component.form.firstName).toBe('Иван');
        expect(component.hasUnsavedChanges()).toBeFalse();
        expect(fixture.nativeElement.textContent).toContain(
            'Общая карточка игрока',
        );
    });
    it('submits a correction but keeps the old identity until approval', async () => {
        component.form.firstName = 'Пётр';
        component.form.reason = 'Опечатка';
        await component.submit();
        fixture.detectChanges();
        expect(api.submit).toHaveBeenCalledWith(
            1,
            5,
            jasmine.objectContaining({
                firstName: 'Пётр',
                expectedVersion: 1,
                teamId: 3,
                reason: 'Опечатка',
            }),
        );
        expect(component.view()?.player.firstName).toBe('Иван');
        expect(component.view()?.pending).toBeTrue();
        expect(component.hasUnsavedChanges()).toBeFalse();
        expect(component.notice()).toContain('прежние данные');
    });
    it('requires a real change and nonblank explanation before sending', async () => {
        component.form.reason = 'Причина';
        await component.submit();
        expect(api.submit).not.toHaveBeenCalled();
        component.form.firstName = 'Пётр';
        component.form.reason = ' ';
        await component.submit();
        expect(api.submit).not.toHaveBeenCalled();
        expect(component.error()).toContain('причину');
    });
    it('blocks repeated pending requests but leaves photo upload available', async () => {
        component.view.set({ ...view, pending: true });
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('form fieldset').disabled,
        ).toBeTrue();
        expect(
            fixture.nativeElement.querySelector('input[type=file]').disabled,
        ).toBeFalse();
        component.form.firstName = 'Пётр';
        component.form.reason = 'Опечатка';
        await component.submit();
        expect(api.submit).not.toHaveBeenCalled();
    });
    it('retains corrections when photo is saved and uses the old URL for concurrency control', async () => {
        const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
        component.photo = file;
        component.form.firstName = 'Пётр';
        component.form.reason = 'Опечатка';
        const changed = spyOn(component.changed, 'emit');
        await component.uploadPhoto();
        expect(api.photo).toHaveBeenCalledWith(1, 5, file, '/old.jpg', 3);
        expect(component.view()?.player.photoUrl).toBe('/new.jpg');
        expect(component.photo).toBeNull();
        expect(component.form.firstName).toBe('Пётр');
        expect(component.hasUnsavedChanges()).toBeTrue();
        expect(changed).toHaveBeenCalled();
    });
    it('validates photo types before sending', () => {
        const target = {
            files: [new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })],
            value: 'bad',
        };
        component.selectPhoto({ target } as unknown as Event);
        expect(component.photo).toBeNull();
        expect(component.error()).toContain('5 МБ');
        expect(api.photo).not.toHaveBeenCalled();
    });
    it('keeps the form after a server failure and displays the reason', async () => {
        api.submit.and.returnValue(
            throwError(() => ({ error: { message: 'Карточка изменилась' } })),
        );
        component.form.firstName = 'Пётр';
        component.form.reason = 'Опечатка';
        await component.submit();
        expect(component.form.firstName).toBe('Пётр');
        expect(component.error()).toBe('Карточка изменилась');
        expect(component.busy()).toBeFalse();
    });
    it('does not close an unsaved profile when confirmation is cancelled', () => {
        const closed = spyOn(component.closed, 'emit');
        spyOn(window, 'confirm').and.returnValue(false);
        component.form.lastName = 'Петров';
        component.close();
        expect(closed).not.toHaveBeenCalled();
    });
    it('shows a returned explanation and permits preparing a new request', () => {
        component.view.set({
            ...view,
            changes: [
                {
                    id: 8,
                    status: 'changes_requested',
                    reason: 'Опечатка',
                    after: view.player,
                    comment: 'Уточните имя',
                    createdAt: '2026-11-04T10:00:00Z',
                } as never,
            ],
        });
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Уточните имя');
        expect(
            fixture.nativeElement.querySelector('form fieldset').disabled,
        ).toBeFalse();
    });
    it('loads a returned proposal for revision without overwriting the current shared identity', () => {
        component.revise({
            after: { ...view.player, firstName: 'Пётр' },
            reason: 'Опечатка',
        });
        expect(component.form.firstName).toBe('Пётр');
        expect(component.form.reason).toBe('Опечатка');
        expect(component.view()?.player.firstName).toBe('Иван');
        expect(component.hasUnsavedChanges()).toBeTrue();
    });
});
