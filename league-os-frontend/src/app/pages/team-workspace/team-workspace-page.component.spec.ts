import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
    ActivatedRoute,
    convertToParamMap,
    provideRouter,
} from '@angular/router';
import { of, throwError } from 'rxjs';
import {
    TeamWorkspaceApi,
    TeamProfileView,
    TeamWorkspace,
} from '../../entities/team/api/team-workspace.api';
import {
    ApplicationDetail,
    TournamentApplicationApi,
} from '../../entities/tournament-application/tournament-application.api';
import { TeamWorkspacePageComponent } from './team-workspace-page.component';

describe('TeamWorkspacePageComponent', () => {
    let fixture: ComponentFixture<TeamWorkspacePageComponent>;
    let component: TeamWorkspacePageComponent;
    let api: jasmine.SpyObj<TeamWorkspaceApi>;
    let squadApi: jasmine.SpyObj<TournamentApplicationApi>;
    const empty: TeamWorkspace = {
        teams: [],
        defaultCommunity: { id: 1, name: 'Дворовая лига' },
        reviewCommunities: [],
        requests: [],
    };
    const view = (
        version = 1,
        status: 'draft' | 'published' = 'draft',
    ): TeamProfileView => ({
        communityId: 1,
        canManageAccess: true,
        team: {
            id: 3,
            name: 'Новая команда',
            city: 'Чебоксары',
            profileStatus: status,
            profileVersion: version,
        },
    });
    async function settle() {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }
    async function createTeam() {
        api.create.and.returnValue(of(view()));
        component.newTeam.name = 'Новая команда';
        await component.create();
        await settle();
    }
    beforeEach(async () => {
        api = jasmine.createSpyObj<TeamWorkspaceApi>('TeamWorkspaceApi', [
            'workspace',
            'create',
            'profile',
            'managers',
            'update',
            'publish',
            'logo',
            'search',
            'requestAccess',
            'setManager',
            'removeManager',
            'requests',
        ]);
        api.workspace.and.returnValue(of(empty));
        api.profile.and.returnValue(of(view()));
        api.managers.and.returnValue(of({ managers: [], audit: [] }));
        squadApi = jasmine.createSpyObj<TournamentApplicationApi>(
            'TournamentApplicationApi',
            ['roster', 'workspace', 'detail'],
        );
        squadApi.roster.and.returnValue(of([]));
        squadApi.workspace.and.returnValue(of({ teams: [], tournaments: [] }));
        await TestBed.configureTestingModule({
            imports: [TeamWorkspacePageComponent],
            providers: [
                provideRouter([]),
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: { queryParamMap: convertToParamMap({}) },
                    },
                },
                { provide: TeamWorkspaceApi, useValue: api },
                { provide: TournamentApplicationApi, useValue: squadApi },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(TeamWorkspacePageComponent);
        component = fixture.componentInstance;
        await settle();
    });
    it('offers two clear entry paths without an empty selector or expanded forms', () => {
        expect(component.addFlow()).toBe('none');
        expect(fixture.nativeElement.textContent).toContain(
            'Начните со своей команды',
        );
        expect(fixture.nativeElement.textContent).toContain(
            'Моя команда уже есть',
        );
        expect(fixture.nativeElement.querySelector('form')).toBeNull();
        expect(fixture.nativeElement.querySelector('select')).toBeNull();
        expect(squadApi.workspace).not.toHaveBeenCalled();
    });
    it('shows one onboarding form at a time and protects an unfinished creation', async () => {
        component.openAddFlow('create');
        await settle();
        expect(
            fixture.nativeElement.querySelector('input[name="newName"]'),
        ).not.toBeNull();
        component.newTeam.name = 'Несохранённая команда';
        spyOn(window, 'confirm').and.returnValue(false);
        component.openAddFlow('find');
        expect(component.addFlow()).toBe('create');
        expect(component.newTeam.name).toBe('Несохранённая команда');
    });
    it('creates a private card and opens its independent squad without adding the owner', async () => {
        await createTeam();
        expect(api.create).toHaveBeenCalled();
        expect(component.profile()?.team.profileStatus).toBe('draft');
        expect(component.section()).toBe('squad');
        expect(squadApi.roster).toHaveBeenCalledWith(1, 3);
        expect(fixture.nativeElement.textContent).toContain(
            'Создатель команды не добавляется',
        );
        expect(api.managers).not.toHaveBeenCalled();
    });
    it('opens the existing team on the squad section and loads access lazily', async () => {
        await component.selectTeam('1:3');
        await settle();
        expect(component.section()).toBe('squad');
        expect(component.roster()).toEqual([]);
        expect(api.managers).not.toHaveBeenCalled();
        await component.selectSection('access');
        expect(api.managers).toHaveBeenCalledWith(1, 3);
    });
    it('keeps profile fields out of the read view until explicit editing', async () => {
        await createTeam();
        await component.selectSection('profile');
        await settle();
        expect(
            fixture.nativeElement.querySelector('input[name="name"]'),
        ).toBeNull();
        component.editing.set(true);
        await settle();
        expect(
            fixture.nativeElement.querySelector('input[name="name"]'),
        ).not.toBeNull();
    });
    it('retains an unsaved profile and the squad editor when changing sections', async () => {
        await createTeam();
        const editor = component.squadEditor;
        component.form.description = 'Несохранённое описание';
        await component.selectSection('profile');
        await settle();
        await component.selectSection('squad');
        await settle();
        expect(component.squadEditor).toBe(editor);
        expect(component.form.description).toBe('Несохранённое описание');
        expect(component.profileDirty()).toBeTrue();
    });
    it('publishes the version returned by an explicit save, not the stale version', async () => {
        await createTeam();
        component.form.description = 'Описание';
        api.update.and.returnValue(of(view(2)));
        api.publish.and.returnValue(of(view(3, 'published')));
        await component.publish();
        expect(api.publish).toHaveBeenCalledWith(1, 3, 2);
        expect(component.profile()?.team.profileStatus).toBe('published');
    });
    it('uploads a logo without saving or discarding unsaved text fields', async () => {
        await createTeam();
        component.form.description = 'Ещё не сохранено';
        api.logo.and.returnValue(
            of({ ...view(2), team: { ...view(2).team, logoUrl: '/logo.png' } }),
        );
        const input = document.createElement('input');
        Object.defineProperty(input, 'files', {
            value: [new File(['logo'], 'logo.png', { type: 'image/png' })],
        });
        await component.uploadLogo({ target: input } as unknown as Event);
        expect(api.update).not.toHaveBeenCalled();
        expect(component.form.description).toBe('Ещё не сохранено');
        expect(component.profileDirty()).toBeTrue();
        expect(component.profile()?.team.profileVersion).toBe(2);
        expect(component.profile()?.team.logoUrl).toBe('/logo.png');
    });
    it('shows a concurrent save conflict without losing the typed fields', async () => {
        await createTeam();
        component.form.description = 'Несохранённое описание';
        api.update.and.returnValue(
            throwError(() => ({
                error: { message: 'Карточка изменена в другом окне' },
            })),
        );
        await component.save();
        expect(component.error()).toContain('другом окне');
        expect(component.form.description).toBe('Несохранённое описание');
        expect(component.busy()).toBeFalse();
    });
    it('does not switch teams or refresh a dirty profile after cancelling confirmation', async () => {
        await createTeam();
        component.form.description = 'Важные изменения';
        spyOn(window, 'confirm').and.returnValue(false);
        api.profile.calls.reset();
        await component.selectTeam('1:9');
        await component.refreshProfile();
        expect(api.profile).not.toHaveBeenCalled();
        expect(component.selectedTeamKey()).toBe('1:3');
        expect(component.form.description).toBe('Важные изменения');
        expect(component.canLeavePage()).toBeFalse();
    });
    it('restores the native team selector immediately if switching is cancelled', async () => {
        await createTeam();
        component.form.description = 'Изменения';
        spyOn(window, 'confirm').and.returnValue(false);
        const select = document.createElement('select');
        select.innerHTML =
            '<option value="1:3">Первая</option><option value="1:9">Другая</option>';
        select.value = '1:9';
        component.changeTeam(select);
        expect(select.value).toBe('1:3');
    });
    it('requests a browser unload warning for unsaved edits and blocks navigation while saving', async () => {
        await createTeam();
        component.form.city = 'Другой город';
        const event = new Event('beforeunload', {
            cancelable: true,
        }) as BeforeUnloadEvent;
        component.beforeUnload(event);
        expect(event.defaultPrevented).toBeTrue();
        component.busy.set(true);
        expect(component.canLeavePage()).toBeFalse();
        component.busy.set(false);
    });
    it('shows real application states only for the selected community', async () => {
        await createTeam();
        squadApi.workspace.and.returnValue(
            of({
                teams: [],
                tournaments: [
                    {
                        id: 7,
                        communityId: 1,
                        name: 'Кубок',
                        registrationStatus: 'open',
                        canReview: false,
                    },
                    {
                        id: 8,
                        communityId: 2,
                        name: 'Чужой кубок',
                        registrationStatus: 'open',
                        canReview: false,
                    },
                ],
            }),
        );
        squadApi.detail.and.returnValue(
            of({
                application: { status: 'changes_requested' },
                editing: { reason: null },
            } as ApplicationDetail),
        );
        await component.selectSection('tournaments');
        await settle();
        expect(squadApi.detail).toHaveBeenCalledOnceWith(7, 3);
        expect(fixture.nativeElement.textContent).toContain('Нужна доработка');
        expect(fixture.nativeElement.textContent).not.toContain('Чужой кубок');
    });
    it('does not call an unavailable application an unsubmitted one', async () => {
        await createTeam();
        squadApi.workspace.and.returnValue(
            of({
                teams: [],
                tournaments: [
                    {
                        id: 7,
                        communityId: 1,
                        name: 'Кубок',
                        registrationStatus: 'open',
                        canReview: false,
                    },
                ],
            }),
        );
        squadApi.detail.and.returnValue(throwError(() => new Error('offline')));
        await component.selectSection('tournaments');
        await settle();
        expect(fixture.nativeElement.textContent).toContain(
            'Не удалось получить состояние заявки',
        );
        expect(fixture.nativeElement.textContent).not.toContain(
            'Заявка не подана',
        );
    });
    it('protects the last owner and requires confirmation to revoke another manager', async () => {
        await createTeam();
        const owner = {
            userId: 1,
            username: 'owner',
            name: 'Владелец',
            role: 'owner' as const,
            isActive: true,
        };
        const manager = {
            userId: 2,
            username: 'manager',
            name: 'Иван Иванов',
            role: 'manager' as const,
            isActive: true,
        };
        component.management.set({ managers: [owner, manager], audit: [] });
        const confirm = spyOn(window, 'confirm').and.returnValue(false);
        await component.removeManager(owner);
        expect(confirm).not.toHaveBeenCalled();
        await component.removeManager(manager);
        expect(confirm.calls.mostRecent().args[0]).toContain('Иван Иванов');
        expect(api.removeManager).not.toHaveBeenCalled();
    });
    it('does not expose the access section to a manager without ownership rights', async () => {
        api.profile.and.returnValue(of({ ...view(), canManageAccess: false }));
        await component.selectTeam('1:3');
        await settle();
        await component.selectSection('access');
        expect(component.section()).toBe('squad');
        expect(api.managers).not.toHaveBeenCalled();
    });
    it('does not silently rebase an unsaved profile onto a newer server version when granting access', async () => {
        await createTeam();
        component.form.description = 'Мой несохранённый текст';
        component.managerUsername = 'new_manager';
        api.setManager.and.returnValue(of({}));
        api.profile.and.returnValue(of(view(8)));
        await component.assignManager();
        expect(api.setManager).toHaveBeenCalledWith(
            1,
            3,
            'new_manager',
            'manager',
        );
        expect(component.form.description).toBe('Мой несохранённый текст');
        expect(component.profile()?.team.profileVersion).toBe(1);
        expect(component.profileDirty()).toBeTrue();
    });
    it('does not downgrade an existing owner through the add-manager form', async () => {
        await createTeam();
        component.management.set({
            managers: [
                {
                    userId: 1,
                    username: 'owner',
                    name: 'Владелец',
                    role: 'owner',
                    isActive: true,
                },
            ],
            audit: [],
        });
        component.managerUsername = 'owner';
        await component.assignManager();
        expect(api.setManager).not.toHaveBeenCalled();
        expect(component.error()).toContain(
            'не понижает существующих владельцев',
        );
    });
    it('moves community moderation out of the captain workspace', async () => {
        component.workspace.set({
            ...empty,
            reviewCommunities: [{ id: 1, name: 'Лига' }],
        });
        await settle();
        expect(
            fixture.nativeElement.querySelector(
                'a[href="/dashboard/communities#team-access-requests"]',
            ),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('app-team-access-requests'),
        ).toBeNull();
        expect(api.requests).not.toHaveBeenCalled();
    });
});
