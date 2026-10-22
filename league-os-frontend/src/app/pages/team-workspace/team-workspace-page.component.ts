import { CommonModule } from '@angular/common';
import {
    Component,
    HostListener,
    ViewChild,
    inject,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
    TeamManagement,
    TeamManager,
    TeamProfileForm,
    TeamProfileView,
    TeamWorkspace,
    TeamWorkspaceApi,
} from '../../entities/team/api/team-workspace.api';
import {
    ApplicationDetail,
    RegistrationTournament,
    SquadPlayer,
    TournamentApplicationApi,
} from '../../entities/tournament-application/tournament-application.api';
import { TeamSquadEditorComponent } from './team-squad-editor.component';

type Section = 'squad' | 'profile' | 'tournaments' | 'access';
type AddFlow = 'none' | 'create' | 'find';
interface TournamentRow {
    tournament: RegistrationTournament;
    detail: ApplicationDetail | null;
    unavailable: boolean;
}

@Component({
    selector: 'app-team-workspace-page',
    imports: [CommonModule, FormsModule, RouterLink, TeamSquadEditorComponent],
    templateUrl: './team-workspace-page.component.html',
    styleUrl: './team-workspace-page.component.scss',
})
export class TeamWorkspacePageComponent {
    private readonly api = inject(TeamWorkspaceApi);
    private readonly applications = inject(TournamentApplicationApi);
    private readonly route = inject(ActivatedRoute);
    @ViewChild(TeamSquadEditorComponent) squadEditor?: TeamSquadEditorComponent;
    readonly workspace = signal<TeamWorkspace | null>(null);
    readonly profile = signal<TeamProfileView | null>(null);
    readonly management = signal<TeamManagement | null>(null);
    readonly tournaments = signal<TournamentRow[]>([]);
    readonly tournamentsLoaded = signal(false);
    readonly roster = signal<SquadPlayer[] | null>(null);
    readonly searchResults = signal<
        { id: number; name: string; city?: string; village?: string }[]
    >([]);
    readonly searchDone = signal(false);
    readonly accessTeam = signal<{ id: number; name: string } | null>(null);
    readonly busy = signal(false);
    readonly squadBusy = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly selectedTeamKey = signal('');
    readonly section = signal<Section>('squad');
    readonly addFlow = signal<AddFlow>('none');
    readonly editing = signal(false);
    form = this.emptyForm();
    newTeam = this.emptyForm();
    private savedForm = JSON.stringify(this.form);
    search = '';
    accessReason = '';
    managerUsername = '';
    ownerUsername = '';
    readonly labels: Record<string, string> = {
        draft: 'Черновик',
        published: 'Опубликована',
        pending: 'На рассмотрении',
        approved: 'Доступ предоставлен',
        rejected: 'Отказ',
        owner: 'Владелец',
        manager: 'Управляющий',
    };
    readonly applicationLabels: Record<string, string> = {
        draft: 'Черновик заявки',
        submitted: 'На рассмотрении',
        changes_requested: 'Нужна доработка',
        approved: 'Заявка утверждена',
    };
    readonly auditLabels: Record<string, string> = {
        team_created: 'Команда создана',
        profile_published: 'Карточка опубликована',
        manager_assigned: 'Права назначены',
        manager_removed: 'Права отозваны',
        access_approved: 'Запрос доступа подтверждён',
        access_rejected: 'Запрос доступа отклонён',
        legacy_access_preserved: 'Сохранены прежние права капитана',
    };

    constructor() {
        void this.run(async () => {
            await this.refreshWorkspace();
            const query = this.route.snapshot.queryParamMap;
            const chosen =
                this.workspace()?.teams.find(
                    (t) =>
                        t.teamId === Number(query.get('teamId')) &&
                        (!query.has('communityId') ||
                            t.communityId === Number(query.get('communityId'))),
                ) ?? this.workspace()?.teams[0];
            if (chosen)
                await this.loadProfile(chosen.communityId, chosen.teamId);
        });
    }
    private emptyForm(): TeamProfileForm {
        return {
            name: '',
            shortName: '',
            description: '',
            city: '',
            village: '',
            foundedYear: null,
            primaryColor: '#264d78',
            secondaryColor: '#ffffff',
        };
    }
    profileDirty() {
        return !!this.profile() && JSON.stringify(this.form) !== this.savedForm;
    }
    private createDirty() {
        return (
            this.addFlow() === 'create' &&
            JSON.stringify(this.newTeam) !== JSON.stringify(this.emptyForm())
        );
    }
    hasUnsavedChanges() {
        return (
            this.profileDirty() ||
            this.createDirty() ||
            !!this.squadEditor?.hasUnsavedChanges() ||
            !!this.accessReason.trim()
        );
    }
    canLeavePage() {
        if (this.busy() || this.squadBusy()) return false;
        return (
            !this.hasUnsavedChanges() ||
            window.confirm(
                'Есть несохранённые изменения. Покинуть страницу и потерять их?',
            )
        );
    }
    @HostListener('window:beforeunload', ['$event'])
    beforeUnload(event: BeforeUnloadEvent) {
        if (this.hasUnsavedChanges() || this.busy() || this.squadBusy()) {
            event.preventDefault();
            event.returnValue = '';
        }
    }
    private async refreshWorkspace() {
        this.workspace.set(await firstValueFrom(this.api.workspace()));
    }
    private applyProfile(view: TeamProfileView) {
        this.profile.set(view);
        const t = view.team;
        this.form = {
            name: t.name,
            shortName: t.shortName ?? '',
            description: t.description ?? '',
            city: t.city ?? '',
            village: t.village ?? '',
            foundedYear: t.foundedYear ?? null,
            primaryColor: t.primaryColor || '#264d78',
            secondaryColor: t.secondaryColor || '#ffffff',
        };
        this.savedForm = JSON.stringify(this.form);
    }
    private async loadProfile(c: number, t: number) {
        // Commit the selection only after a successful fetch, retaining the previous editor on failure.
        const view = await firstValueFrom(this.api.profile(c, t));
        this.applyProfile(view);
        this.selectedTeamKey.set(`${c}:${t}`);
        this.management.set(null);
        this.tournaments.set([]);
        this.tournamentsLoaded.set(false);
        this.roster.set(null);
        this.section.set('squad');
        this.editing.set(false);
        this.managerUsername = this.ownerUsername = '';
    }
    async selectTeam(key: string) {
        if (key === this.selectedTeamKey() || !this.canLeavePage()) return;
        const [c, t] = key.split(':').map(Number);
        await this.run(async () => {
            await this.loadProfile(c, t);
            this.resetAddFlow();
        });
    }
    changeTeam(select: HTMLSelectElement) {
        const key = select.value;
        select.value = this.selectedTeamKey();
        void this.selectTeam(key);
    }
    openAddFlow(flow: AddFlow) {
        if (this.busy() || this.squadBusy()) return;
        if (
            (this.createDirty() || this.accessReason.trim()) &&
            !window.confirm('Закрыть форму без сохранения введённых данных?')
        )
            return;
        this.resetAddFlow();
        this.addFlow.set(flow);
        this.error.set('');
    }
    private resetAddFlow() {
        this.addFlow.set('none');
        this.newTeam = this.emptyForm();
        this.search = '';
        this.accessReason = '';
        this.accessTeam.set(null);
        this.searchResults.set([]);
        this.searchDone.set(false);
    }
    create() {
        if (this.busy() || this.squadBusy()) return;
        if (this.profileDirty() || this.squadEditor?.hasUnsavedChanges()) {
            if (
                !window.confirm(
                    'Перейти к новой команде? Несохранённые изменения прежней команды будут потеряны.',
                )
            )
                return;
        }
        return this.run(async () => {
            const view = await firstValueFrom(this.api.create(this.newTeam));
            // Keep the created team available even if refreshing the list fails.
            this.applyProfile(view);
            this.selectedTeamKey.set(`${view.communityId}:${view.team.id}`);
            this.roster.set(null);
            this.management.set(null);
            this.tournaments.set([]);
            this.tournamentsLoaded.set(false);
            this.section.set('squad');
            this.editing.set(false);
            this.resetAddFlow();
            this.notice.set(
                'Команда создана. Теперь добавьте игроков в состав.',
            );
            await this.refreshWorkspace();
        });
    }
    async selectSection(section: Section) {
        if (this.busy() || this.squadBusy()) return;
        if (section === 'access' && !this.profile()?.canManageAccess) return;
        this.section.set(section);
        if (section === 'access') await this.run(() => this.loadManagement());
        if (section === 'tournaments') await this.loadTournaments();
    }
    loadTournaments() {
        return this.run(async () => {
            const p = this.profile();
            if (!p) return;
            this.tournamentsLoaded.set(false);
            const workspace = await firstValueFrom(
                this.applications.workspace(),
            );
            const rows = await Promise.all(
                workspace.tournaments
                    .filter((t) => t.communityId === p.communityId)
                    .map(async (tournament) => {
                        try {
                            return {
                                tournament,
                                detail: await firstValueFrom(
                                    this.applications.detail(
                                        tournament.id,
                                        p.team.id,
                                    ),
                                ),
                                unavailable: false,
                            };
                        } catch {
                            return {
                                tournament,
                                detail: null,
                                unavailable: true,
                            };
                        }
                    }),
            );
            this.tournaments.set(rows);
            this.tournamentsLoaded.set(true);
        });
    }
    private async saveInternal() {
        const p = this.profile();
        if (!p) return;
        this.applyProfile(
            await firstValueFrom(
                this.api.update(
                    p.communityId,
                    p.team.id,
                    this.form,
                    p.team.profileVersion,
                ),
            ),
        );
    }
    save() {
        return this.run(async () => {
            await this.saveInternal();
            this.editing.set(false);
            this.notice.set('Карточка команды сохранена');
            await this.refreshWorkspace();
        });
    }
    cancelEdit() {
        if (
            this.profileDirty() &&
            !window.confirm(
                'Отменить несохранённые изменения карточки команды?',
            )
        )
            return;
        const p = this.profile();
        if (p) this.applyProfile(p);
        this.editing.set(false);
    }
    publish() {
        return this.run(async () => {
            if (this.profileDirty()) await this.saveInternal();
            const p = this.profile();
            if (!p) return;
            this.applyProfile(
                await firstValueFrom(
                    this.api.publish(
                        p.communityId,
                        p.team.id,
                        p.team.profileVersion,
                    ),
                ),
            );
            this.editing.set(false);
            this.notice.set(
                'Карточка опубликована. Допуск к турниру оформляется отдельно через заявку.',
            );
            await this.refreshWorkspace();
        });
    }
    uploadLogo(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        return this.run(async () => {
            try {
                if (file.size > 5 * 1024 * 1024)
                    throw new Error('Логотип должен быть не больше 5 МБ');
                if (
                    !['image/png', 'image/jpeg', 'image/webp'].includes(
                        file.type,
                    )
                )
                    throw new Error('Выберите PNG, JPEG или WebP');
                const p = this.profile();
                if (!p) return;
                const draft = this.form,
                    dirty = this.profileDirty();
                const view = await firstValueFrom(
                    this.api.logo(
                        p.communityId,
                        p.team.id,
                        file,
                        p.team.profileVersion,
                    ),
                );
                this.applyProfile(view);
                if (dirty) this.form = draft;
                this.notice.set(
                    'Логотип загружен. Остальные поля карточки не сохранялись.',
                );
            } finally {
                input.value = '';
            }
        });
    }
    refreshProfile() {
        if (!this.canLeavePage()) return;
        return this.run(async () => {
            const p = this.profile();
            if (!p) return;
            this.applyProfile(
                await firstValueFrom(
                    this.api.profile(p.communityId, p.team.id),
                ),
            );
            this.notice.set('Карточка обновлена с сервера');
        });
    }
    searchTeams() {
        return this.run(async () => {
            this.searchDone.set(false);
            this.accessTeam.set(null);
            this.searchResults.set(
                await firstValueFrom(this.api.search(this.search)),
            );
            this.searchDone.set(true);
        });
    }
    requestAccess(teamId: number) {
        return this.run(async () => {
            await firstValueFrom(
                this.api.requestAccess(teamId, this.accessReason),
            );
            this.accessReason = '';
            this.accessTeam.set(null);
            this.notice.set(
                'Запрос отправлен. Доступ появится после подтверждения администратором сообщества.',
            );
            await this.refreshWorkspace();
        });
    }
    private async loadManagement() {
        const p = this.profile();
        if (!p?.canManageAccess) return;
        this.management.set(
            await firstValueFrom(this.api.managers(p.communityId, p.team.id)),
        );
    }
    assignManager(role: 'owner' | 'manager' = 'manager') {
        const username = (
            role === 'owner' ? this.ownerUsername : this.managerUsername
        ).trim();
        if (!username || this.busy()) return;
        if (
            role === 'manager' &&
            this.management()?.managers.some(
                (manager) =>
                    manager.username === username && manager.role === 'owner',
            )
        ) {
            this.error.set(
                'У пользователя уже есть права владельца. Добавление управляющего не понижает существующих владельцев.',
            );
            return;
        }
        if (
            role === 'owner' &&
            !window.confirm(
                `Назначить @${username} владельцем команды «${this.profile()?.team.name}»? Он сможет выдавать и отзывать доступ, в том числе ваш. Ваши текущие права сохранятся.`,
            )
        )
            return;
        return this.run(async () => {
            const p = this.profile();
            if (!p) return;
            await firstValueFrom(
                this.api.setManager(p.communityId, p.team.id, username, role),
            );
            this.managerUsername = this.ownerUsername = '';
            const latest = await firstValueFrom(
                this.api.profile(p.communityId, p.team.id),
            );
            // Refresh permissions, not the profile version: otherwise an old draft
            // could overwrite concurrent profile edits after an unrelated role change.
            this.profile.set({ ...p, canManageAccess: latest.canManageAccess });
            this.management.set(null);
            if (this.profile()?.canManageAccess) await this.loadManagement();
            else this.section.set('squad');
            this.notice.set(
                'Права обновлены. Пользователь не добавлен в игровой состав.',
            );
        });
    }
    isLastOwner(manager: TeamManager) {
        return (
            manager.role === 'owner' &&
            manager.isActive &&
            this.management()?.managers.filter(
                (m) => m.role === 'owner' && m.isActive,
            ).length === 1
        );
    }
    removeManager(manager: TeamManager) {
        if (this.busy() || this.isLastOwner(manager) || !this.canLeavePage())
            return;
        if (
            !window.confirm(
                `Отозвать доступ у ${manager.name} (@${manager.username}) к команде «${this.profile()?.team.name}»? Он больше не сможет управлять карточкой, составом и заявками. Игровой состав и заявки турниров не изменятся.`,
            )
        )
            return;
        return this.run(async () => {
            const p = this.profile();
            if (!p) return;
            await firstValueFrom(
                this.api.removeManager(
                    p.communityId,
                    p.team.id,
                    manager.userId,
                ),
            );
            await this.refreshWorkspace();
            if (
                this.workspace()?.teams.some(
                    (t) =>
                        t.communityId === p.communityId &&
                        t.teamId === p.team.id,
                )
            ) {
                const latest = await firstValueFrom(
                    this.api.profile(p.communityId, p.team.id),
                );
                this.profile.set({
                    ...p,
                    canManageAccess: latest.canManageAccess,
                });
                this.management.set(null);
                if (this.profile()?.canManageAccess)
                    await this.loadManagement();
                else this.section.set('squad');
            } else {
                this.profile.set(null);
                this.management.set(null);
                this.selectedTeamKey.set('');
            }
            this.notice.set('Доступ отозван');
        });
    }
    private async run(action: () => Promise<void>) {
        if (this.busy() || this.squadBusy()) return;
        this.busy.set(true);
        this.error.set('');
        this.notice.set('');
        try {
            await action();
        } catch (error) {
            const message = (
                error as { error?: { message?: string | string[] } }
            ).error?.message;
            this.error.set(
                Array.isArray(message)
                    ? message.join('. ')
                    : message ||
                          (error instanceof Error
                              ? error.message
                              : 'Не удалось выполнить действие'),
            );
        } finally {
            this.busy.set(false);
        }
    }
}
