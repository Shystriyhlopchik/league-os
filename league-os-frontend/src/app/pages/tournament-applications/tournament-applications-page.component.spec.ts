import {
    ComponentFixture,
    fakeAsync,
    TestBed,
    tick,
} from '@angular/core/testing';
import {
    ActivatedRoute,
    convertToParamMap,
    provideRouter,
    Router,
} from '@angular/router';
import { of, throwError } from 'rxjs';
import { CommunityApi } from '../../entities/community/community.api';
import {
    ApplicationDetail,
    ApplicationRevision,
    SquadPlayer,
    TournamentApplication,
    TournamentApplicationApi,
} from '../../entities/tournament-application/tournament-application.api';
import { TournamentApplicationsPageComponent } from './tournament-applications-page.component';

describe('TournamentApplicationsPageComponent', () => {
    let fixture: ComponentFixture<TournamentApplicationsPageComponent>;
    let component: TournamentApplicationsPageComponent;
    let api: jasmine.SpyObj<TournamentApplicationApi>;
    let communities: jasmine.SpyObj<CommunityApi>;
    let server: ApplicationDetail;
    let route: {
        snapshot: { queryParamMap: ReturnType<typeof convertToParamMap> };
    };
    let nextRevision: number;
    const policy = {
        version: 1 as const,
        maxPlayers: 12,
        minPlayers: 5,
        maxRepresentatives: 2,
        minMatchPlayers: 5,
        maxMatchPlayers: 12,
        allowAmendments: true,
        deadline: null,
    };
    const tournament = {
        id: 5,
        name: 'Кубок',
        registrationStatus: 'open',
        lifecycleStatus: 'draft',
        registrationOpenedAt: '2026-10-21',
    };
    const roster: SquadPlayer[] = Array.from({ length: 5 }, (_, i) => ({
        id: 10 + i,
        playerId: 7 + i,
        shirtNumber: i + 1,
        isCaptain: i === 0,
        player: {
            firstName: 'Иван',
            lastName: 'Игрок' + i,
            birthDate: '2000-01-01',
        },
    }));
    const team = {
        communityId: 1,
        communityName: 'Лига',
        teamId: 3,
        name: 'Команда',
    };
    const workspace = () => ({
        teams: [team],
        tournaments: [
            {
                id: 5,
                name: 'Кубок',
                communityId: 1,
                registrationStatus: 'open',
                canReview: false,
            },
        ],
    });
    function revision(id = 21): ApplicationRevision {
        return {
            id,
            version: 1,
            snapshot: {
                players: roster.map((p) => ({
                    playerId: p.playerId,
                    teamPlayerId: p.id,
                    name: p.player.lastName + ' ' + p.player.firstName,
                    shirtNumber: p.shirtNumber,
                    isCaptain: p.isCaptain,
                })),
                representatives: [],
            },
        };
    }
    function setApplication(
        status: string,
        approvedRevisionId: number | null = null,
        teamId = 3,
    ) {
        server = {
            ...server,
            application: {
                id: 2,
                teamId,
                status,
                currentRevisionId: 21,
                approvedRevisionId,
                team: { name: teamId === 3 ? 'Команда' : 'Другая команда' },
            },
            revisions: [revision()],
            editing: {
                ...server.editing,
                canEdit: status !== 'submitted',
                reason:
                    status === 'submitted'
                        ? 'Заявка на рассмотрении. Дождитесь решения администратора'
                        : null,
            },
        };
    }
    async function settle() {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }
    async function recreate(query: Record<string, string>) {
        fixture.destroy();
        route.snapshot.queryParamMap = convertToParamMap(query);
        fixture = TestBed.createComponent(TournamentApplicationsPageComponent);
        component = fixture.componentInstance;
        await settle();
    }
    beforeEach(async () => {
        nextRevision = 22;
        server = {
            tournament: { ...tournament },
            policy: { ...policy },
            application: null,
            revisions: [],
            events: [],
            canReview: false,
            editing: {
                locked: false,
                locksAt: null,
                serverNow: new Date().toISOString(),
                canEdit: true,
                reason: null,
            },
        };
        route = { snapshot: { queryParamMap: convertToParamMap({}) } };
        api = jasmine.createSpyObj<TournamentApplicationApi>(
            'TournamentApplicationApi',
            [
                'workspace',
                'detail',
                'roster',
                'save',
                'submit',
                'review',
                'settings',
                'list',
                'members',
                'transfers',
            ],
        );
        communities = jasmine.createSpyObj<CommunityApi>('CommunityApi', [
            'list',
        ]);
        communities.list.and.returnValue(of([]));
        api.workspace.and.returnValue(of(workspace()));
        api.detail.and.callFake(() => of(server));
        api.roster.and.returnValue(of(roster));
        api.settings.and.callFake(() =>
            of({
                tournament: { ...server.tournament },
                policy: { ...server.policy },
                communityId: 1,
                canReview: true,
                canManageMembers: false,
            }),
        );
        api.list.and.returnValue(of([]));
        api.members.and.returnValue(of([]));
        api.transfers.and.returnValue(of([]));
        api.save.and.callFake((_t, teamId, ids, representatives) => {
            const saved: TournamentApplication = {
                id: 2,
                teamId,
                status: 'draft',
                currentRevisionId: nextRevision++,
                approvedRevisionId:
                    server.application?.approvedRevisionId ?? null,
                team: { name: 'Команда' },
            };
            server = {
                ...server,
                application: saved,
                revisions: [
                    {
                        id: saved.currentRevisionId!,
                        version: server.revisions.length + 1,
                        snapshot: {
                            players: roster
                                .filter((p) => ids.includes(p.playerId))
                                .map((p) => ({
                                    playerId: p.playerId,
                                    teamPlayerId: p.id,
                                    name:
                                        p.player.lastName +
                                        ' ' +
                                        p.player.firstName,
                                    shirtNumber: p.shirtNumber,
                                    isCaptain: p.isCaptain,
                                })),
                            representatives,
                        },
                    },
                    ...server.revisions,
                ],
            };
            return of(saved);
        });
        api.submit.and.callFake(() => {
            server = {
                ...server,
                application: { ...server.application!, status: 'submitted' },
                editing: {
                    ...server.editing,
                    canEdit: false,
                    reason: 'Заявка на рассмотрении. Дождитесь решения администратора',
                },
            };
            return of({});
        });
        api.review.and.returnValue(of({}));
        await TestBed.configureTestingModule({
            imports: [TournamentApplicationsPageComponent],
            providers: [
                provideRouter([]),
                { provide: ActivatedRoute, useValue: route },
                { provide: TournamentApplicationApi, useValue: api },
                { provide: CommunityApi, useValue: communities },
            ],
        }).compileComponents();
        spyOn(TestBed.inject(Router), 'navigate').and.returnValue(
            Promise.resolve(true),
        );
        fixture = TestBed.createComponent(TournamentApplicationsPageComponent);
        component = fixture.componentInstance;
        await settle();
    });
    it('focuses on one team application and does not render a second squad editor', () => {
        expect(fixture.nativeElement.textContent).toContain('Кубок');
        expect(fixture.nativeElement.textContent).toContain('Команда');
        expect(fixture.nativeElement.textContent).toContain(
            'Заявка ещё не создана',
        );
        expect(
            fixture.nativeElement.querySelectorAll('.player-check').length,
        ).toBe(5);
        expect(fixture.nativeElement.textContent).not.toContain(
            'Текущий состав команды',
        );
        expect(
            fixture.nativeElement.querySelector('input[type="number"]'),
        ).toBeNull();
        expect(component.selectedPlayers).toEqual([7, 8, 9, 10, 11]);
        expect(component.applicationDirty()).toBeFalse();
    });
    it('saves an incomplete draft with only selected ids and nonempty representatives', async () => {
        component.selectedPlayers = [7, 8];
        component.representatives = ['  Иван Представитель  ', ''];
        await component.save();
        expect(api.save).toHaveBeenCalledWith(
            5,
            3,
            [7, 8],
            [{ name: 'Иван Представитель' }],
            undefined,
        );
        expect(api.submit).not.toHaveBeenCalled();
        expect(component.detail()?.application?.status).toBe('draft');
        expect(component.applicationDirty()).toBeFalse();
    });
    it('validates the minimum locally before sending anything', async () => {
        component.selectedPlayers = [7];
        await component.save(true);
        expect(api.save).not.toHaveBeenCalled();
        expect(api.submit).not.toHaveBeenCalled();
        expect(component.error()).toContain('требуется от 5 до 12');
    });
    it('validates captain, unique numbers and duplicate representatives locally', () => {
        component.roster.set(
            roster.map((p) => ({ ...p, isCaptain: false, shirtNumber: 1 })),
        );
        component.representatives = ['Иван Иванов', 'иван иванов'];
        const failures = component.readiness().filter((p) => !p.ok);
        expect(failures.length).toBe(3);
        expect(component.readyToSubmit()).toBeFalse();
    });
    it('prevents selecting more players than the tournament limit', () => {
        component.detail.update((d) =>
            d ? { ...d, policy: { ...d.policy, maxPlayers: 5 } } : d,
        );
        component.togglePlayer(100, true);
        expect(component.selectedPlayers).not.toContain(100);
        component.togglePlayer(7, false);
        component.togglePlayer(100, true);
        expect(component.selectedPlayers).toContain(100);
        expect(component.readyToSubmit()).toBeFalse();
    });
    it('submits the saved revision and switches to a read-only submitted snapshot', async () => {
        await component.save(true);
        await settle();
        expect(api.submit).toHaveBeenCalledWith(5, 3, 22);
        expect(component.detail()?.application?.status).toBe('submitted');
        expect(fixture.nativeElement.querySelector('.player-check')).toBeNull();
        expect(
            fixture.nativeElement.querySelector('.snapshot-row'),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain(
            'Дождитесь решения',
        );
    });
    it('retains the committed version after a failed submit and retries it without another save', async () => {
        let attempts = 0;
        api.submit.and.callFake(() => {
            if (++attempts === 1)
                return throwError(() => ({
                    error: { message: 'Игрок уже заявлен за другую команду' },
                }));
            server = {
                ...server,
                application: { ...server.application!, status: 'submitted' },
            };
            return of({});
        });
        component.representatives = ['Представитель', ''];
        await component.save(true);
        expect(component.detail()?.application?.currentRevisionId).toBe(22);
        expect(component.notice()).toContain(
            'Черновик сохранён, но заявка не отправлена',
        );
        expect(component.error()).toContain('другую команду');
        expect(component.representatives[0]).toBe('Представитель');
        await component.save(true);
        expect(api.save).toHaveBeenCalledTimes(1);
        expect(api.submit.calls.allArgs()).toEqual([
            [5, 3, 22],
            [5, 3, 22],
        ]);
    });
    it('keeps the committed revision even if both submit and refreshing fail', async () => {
        api.submit.and.returnValue(
            throwError(() => ({ error: { message: 'Сеть недоступна' } })),
        );
        api.detail.and.returnValue(throwError(() => new Error('offline')));
        component.representatives = ['Представитель', ''];
        await component.save(true);
        expect(component.detail()?.application?.currentRevisionId).toBe(22);
        expect(component.representatives[0]).toBe('Представитель');
        api.submit.and.returnValue(of({}));
        await component.save(true);
        expect(api.save).toHaveBeenCalledTimes(1);
        expect(api.submit.calls.mostRecent().args[2]).toBe(22);
        expect(component.detail()?.application?.status).toBe('submitted');
        expect(component.editing()).toBeFalse();
    });
    it('does not lose fields or submit after a failed draft save', async () => {
        api.save.and.returnValue(
            throwError(() => ({
                error: { message: 'Заявка изменена в другом окне' },
            })),
        );
        component.representatives = ['Несохранённый представитель', ''];
        await component.save(true);
        expect(component.error()).toContain('другом окне');
        expect(component.representatives[0]).toBe(
            'Несохранённый представитель',
        );
        expect(component.applicationDirty()).toBeTrue();
        expect(api.submit).not.toHaveBeenCalled();
    });
    it('protects unsaved fields when selecting another team, tournament or mode', async () => {
        component.teams.update((t) => [...t, { ...team, teamId: 9 }]);
        component.tournaments.update((t) => [
            ...t.map((x) => ({ ...x, canReview: true })),
            { ...t[0], id: 6 },
        ]);
        component.representatives = ['Несохранённый текст', ''];
        spyOn(window, 'confirm').and.returnValue(false);
        api.detail.calls.reset();
        await component.selectTeam(9);
        await component.selectTournament(6);
        await component.selectMode('management');
        expect(component.teamId()).toBe(3);
        expect(component.tournamentId()).toBe(5);
        expect(component.mode()).toBe('application');
        expect(component.representatives[0]).toBe('Несохранённый текст');
        expect(api.detail).not.toHaveBeenCalled();
    });
    it('restores the native selection when switching is cancelled', () => {
        component.representatives[0] = 'Текст';
        spyOn(window, 'confirm').and.returnValue(false);
        const select = document.createElement('select');
        select.innerHTML =
            '<option value="3">Первая</option><option value="9">Вторая</option>';
        select.value = '9';
        component.changeTeam(select);
        expect(select.value).toBe('3');
    });
    it('keeps the previous team context if loading the new team fails', async () => {
        component.teams.update((t) => [...t, { ...team, teamId: 9 }]);
        api.detail.and.returnValue(throwError(() => new Error('offline')));
        await component.selectTeam(9);
        expect(component.teamId()).toBe(3);
        expect(component.selectedTeam()?.name).toBe('Команда');
        expect(component.detail()?.tournament.id).toBe(5);
    });
    it('requires a fresh saved snapshot when captain or numbers changed in the team workspace', async () => {
        setApplication('draft');
        api.roster.and.returnValue(
            of(
                roster.map((player, i) => ({
                    ...player,
                    shirtNumber: i + 20,
                    isCaptain: i === 1,
                })),
            ),
        );
        await component.refreshApplication();
        expect(component.applicationDirty()).toBeTrue();
        await component.save();
        expect(api.save).toHaveBeenCalledWith(5, 3, [7, 8, 9, 10, 11], [], 21);
    });
    it('protects refresh and browser unload while there are unsaved fields', async () => {
        component.representatives[0] = 'Текст';
        spyOn(window, 'confirm').and.returnValue(false);
        api.detail.calls.reset();
        await component.refreshApplication();
        expect(api.detail).not.toHaveBeenCalled();
        const event = new Event('beforeunload', {
            cancelable: true,
        }) as BeforeUnloadEvent;
        component.beforeUnload(event);
        expect(event.defaultPrevented).toBeTrue();
        component.busy.set(true);
        expect(component.canLeavePage()).toBeFalse();
        component.busy.set(false);
    });
    it('shows the return comment before the editor instead of burying it in history', async () => {
        setApplication('changes_requested');
        server.events = [
            {
                id: 1,
                action: 'returned',
                comment: 'Уточните представителя',
                revisionId: 21,
                createdAt: '2026-10-22T12:00:00Z',
            },
        ];
        await component.refreshApplication();
        await settle();
        const text = fixture.nativeElement.textContent as string;
        expect(text.indexOf('Уточните представителя')).toBeLessThan(
            text.indexOf('Выберите игроков'),
        );
        expect(component.isEditing()).toBeTrue();
    });
    it('shows the accepted immutable snapshot and begins amendments only explicitly', async () => {
        setApplication('approved', 21);
        server.revisions[0].snapshot.players[0].name =
            'Игрок из утверждённой версии';
        await component.refreshApplication();
        await settle();
        expect(component.isEditing()).toBeFalse();
        expect(fixture.nativeElement.textContent).toContain(
            'Игрок из утверждённой версии',
        );
        expect(fixture.nativeElement.querySelector('.player-check')).toBeNull();
        await component.beginAmendment();
        await settle();
        expect(component.isEditing()).toBeTrue();
        expect(
            fixture.nativeElement.querySelector('.player-check'),
        ).not.toBeNull();
        expect(component.approvedRevision()?.id).toBe(21);
    });
    it('preserves the previously accepted roster during amendment review', async () => {
        setApplication('approved', 21);
        await component.refreshApplication();
        await component.beginAmendment();
        component.representatives[0] = 'Новый представитель';
        await component.save(true);
        await settle();
        expect(component.detail()?.application?.approvedRevisionId).toBe(21);
        expect(component.detail()?.application?.currentRevisionId).toBe(22);
        expect(fixture.nativeElement.textContent).toContain(
            'Ранее утверждённый состав продолжает действовать',
        );
    });
    it('shows deadlines in Moscow time and distinguishes initial registration from amendments', async () => {
        server.policy = { ...server.policy, deadline: '2026-12-01T20:59:00Z' };
        server.editing.locksAt = '2026-12-10T15:00:00Z';
        await component.refreshApplication();
        await settle();
        expect(fixture.nativeElement.textContent).toContain(
            '01.12.2026 23:59 (МСК)',
        );
        expect(fixture.nativeElement.textContent).toContain(
            '10.12.2026 18:00 (МСК)',
        );
    });
    it('locks the open form at the fourth round cutoff using server time', fakeAsync(() => {
        server.editing = {
            locked: false,
            canEdit: true,
            reason: null,
            serverNow: '2026-11-01T14:59:59Z',
            locksAt: '2026-11-01T15:00:00Z',
        };
        void component.refreshApplication();
        tick();
        expect(component.cutoffReached()).toBeFalse();
        tick(1000);
        fixture.detectChanges();
        expect(component.cutoffReached()).toBeTrue();
        expect(component.isEditing()).toBeFalse();
        expect(component.editBlockedReason()).toContain('4-го тура');
    }));
    it('expires the initial deadline in an already open form', fakeAsync(() => {
        server.policy = { ...server.policy, deadline: '2026-11-01T15:00:00Z' };
        server.editing.serverNow = '2026-11-01T14:59:59Z';
        void component.refreshApplication();
        tick();
        tick(1000);
        expect(component.deadlineReached()).toBeTrue();
        expect(component.editBlockedReason()).toContain('Срок подачи');
    }));
    it('does not use an expired initial deadline to block approved amendments', async () => {
        setApplication('approved', 21);
        server.policy = { ...server.policy, deadline: '2020-01-01T00:00:00Z' };
        await component.refreshApplication();
        expect(component.deadlineReached()).toBeFalse();
        await component.beginAmendment();
        expect(component.isEditing()).toBeTrue();
    });
    it('keeps an accepted roster visible after the cutoff and does not save', async () => {
        setApplication('approved', 21);
        server.editing = {
            ...server.editing,
            locked: true,
            canEdit: false,
            reason: 'С начала 4-го тура изменение и утверждение заявок на турнир запрещено',
        };
        await component.refreshApplication();
        await settle();
        expect(fixture.nativeElement.querySelector('.player-check')).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Игрок0 Иван');
        expect(fixture.nativeElement.textContent).toContain('4-го тура');
        component.togglePlayer(7, false);
        expect(component.selectedPlayers).toContain(7);
        await component.save(true);
        expect(api.save).not.toHaveBeenCalled();
    });
    it('does not silently open another tournament when the URL is unavailable', async () => {
        api.detail.calls.reset();
        api.roster.calls.reset();
        await recreate({ teamId: '3', tournamentId: '999' });
        expect(component.contextError()).toContain(
            'Турнир из ссылки недоступен',
        );
        expect(component.tournamentId()).toBe(0);
        expect(api.detail).not.toHaveBeenCalled();
    });
    it('does not silently replace an unavailable team from the URL', async () => {
        api.detail.calls.reset();
        await recreate({ teamId: '91', tournamentId: '5' });
        expect(component.contextError()).toContain(
            'Команда из ссылки недоступна',
        );
        expect(component.teamId()).toBe(0);
        expect(api.detail).not.toHaveBeenCalled();
    });
    it('honors the exact team and tournament from a valid deep link', async () => {
        api.workspace.and.returnValue(
            of({
                teams: [
                    team,
                    { ...team, teamId: 91, name: 'Выбранная команда' },
                ],
                tournaments: [
                    ...workspace().tournaments,
                    { ...workspace().tournaments[0], id: 8 },
                ],
            }),
        );
        await recreate({ teamId: '91', tournamentId: '8' });
        expect(component.contextError()).toBe('');
        expect(api.detail).toHaveBeenCalledWith(8, 91);
        expect(api.roster).toHaveBeenCalledWith(1, 91);
    });
    it('loads management only on explicit entry and hides it from the captain view', async () => {
        component.tournaments.update((t) =>
            t.map((x) => ({ ...x, canReview: true })),
        );
        expect(api.settings).not.toHaveBeenCalled();
        expect(
            fixture.nativeElement.querySelector('app-tournament-workflow'),
        ).toBeNull();
        await component.selectMode('management');
        await settle();
        expect(api.settings).toHaveBeenCalledWith(5);
        expect(
            fixture.nativeElement.querySelectorAll(
                'app-tournament-workflow button',
            ).length,
        ).toBe(5);
        expect(fixture.nativeElement.querySelector('.player-check')).toBeNull();
        expect(fixture.nativeElement.textContent).toContain(
            '2. Открыть приём заявок',
        );
        await component.selectWorkflow('review');
        await settle();
        expect(fixture.nativeElement.textContent).toContain(
            '3. Рассмотреть заявки',
        );
        expect(
            fixture.nativeElement.querySelector(
                'input[placeholder="2026-11-01T23:59:00+03:00"]',
            ),
        ).toBeNull();
    });
    it('opens organizer workflow links directly in management mode', async () => {
        api.workspace.and.returnValue(
            of({
                ...workspace(),
                tournaments: workspace().tournaments.map((t) => ({
                    ...t,
                    canReview: true,
                })),
            }),
        );
        await recreate({ tournamentId: '5', section: 'review' });
        expect(component.mode()).toBe('management');
        expect(component.section()).toBe('review');
        expect(component.detail()).toBeNull();
    });
    it('protects edited registration settings when switching workflow steps', async () => {
        component.tournaments.update((t) =>
            t.map((x) => ({ ...x, canReview: true })),
        );
        await component.selectMode('management');
        component.settings()!.policy.minPlayers = 6;
        spyOn(window, 'confirm').and.returnValue(false);
        await component.selectWorkflow('review');
        expect(component.section()).toBe('registration');
        expect(component.settings()?.policy.minPlayers).toBe(6);
    });
    it('disables approval after cutoff but still allows returning with a comment', async () => {
        setApplication('submitted', 20, 99);
        server.canReview = true;
        server.editing.locked = true;
        component.mode.set('management');
        component.section.set('review');
        component.reviewing.set(true);
        component.detail.set(server);
        component.cutoffReached.set(true);
        component.comment = 'Срок дозаявок завершён';
        await settle();
        const buttons = [
            ...fixture.nativeElement.querySelectorAll('button'),
        ] as HTMLButtonElement[];
        expect(
            buttons.find((b) => b.textContent?.includes('Утвердить заявку'))
                ?.disabled,
        ).toBeTrue();
        expect(
            buttons.find((b) => b.textContent?.includes('Вернуть на доработку'))
                ?.disabled,
        ).toBeFalse();
        await component.review('approve');
        expect(api.review).not.toHaveBeenCalled();
    });
    it('keeps the reviewed team in view after an organizer decision', async () => {
        setApplication('submitted', null, 99);
        server.canReview = true;
        component.mode.set('management');
        component.section.set('review');
        component.reviewing.set(true);
        component.detail.set(server);
        api.review.and.callFake(() => {
            server = {
                ...server,
                application: {
                    ...server.application!,
                    status: 'approved',
                    approvedRevisionId: 21,
                },
            };
            return of({});
        });
        await component.review('approve');
        expect(api.review).toHaveBeenCalledWith(5, 2, 21, 'approve', '');
        expect(component.detail()?.application?.teamId).toBe(99);
        expect(component.detail()?.application?.status).toBe('approved');
        expect(component.reviewing()).toBeTrue();
    });
});
