import { CommonModule } from '@angular/common';
import {
    Component,
    computed,
    DestroyRef,
    HostListener,
    inject,
    NgZone,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
    TournamentWorkflowComponent,
    TournamentWorkflowStep,
} from '../../shared/ui/tournament-workflow/tournament-workflow.component';
import {
    CommunityApi,
    CommunityUser,
} from '../../entities/community/community.api';
import {
    ApplicationDetail,
    ManagedTeam,
    RegistrationTournament,
    SquadPlayer,
    TournamentApplication,
    TournamentApplicationApi,
    TournamentRegistrationSettings,
    TransferRequest,
} from '../../entities/tournament-application/tournament-application.api';

type Mode = 'application' | 'management';

@Component({
    selector: 'app-tournament-applications-page',
    imports: [
        CommonModule,
        FormsModule,
        RouterLink,
        TournamentWorkflowComponent,
    ],
    templateUrl: './tournament-applications-page.component.html',
    styleUrl: './tournament-applications-page.component.scss',
})
export class TournamentApplicationsPageComponent {
    private readonly api = inject(TournamentApplicationApi);
    private readonly communities = inject(CommunityApi);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly zone = inject(NgZone);
    readonly mode = signal<Mode>('application');
    readonly section = signal<'registration' | 'review'>(
        this.route.snapshot.queryParamMap.get('section') === 'review'
            ? 'review'
            : 'registration',
    );
    readonly teams = signal<ManagedTeam[]>([]);
    readonly tournaments = signal<RegistrationTournament[]>([]);
    readonly tournamentId = signal(0);
    readonly teamId = signal(0);
    readonly selectedTournament = computed(() =>
        this.tournaments().find((t) => t.id === this.tournamentId()),
    );
    readonly availableTeams = computed(() =>
        this.teams().filter(
            (t) =>
                t.communityId === this.selectedTournament()?.communityId &&
                t.profileStatus !== 'draft',
        ),
    );
    readonly selectedTeam = computed(() =>
        this.availableTeams().find((t) => t.teamId === this.teamId()),
    );
    readonly settings = signal<TournamentRegistrationSettings | null>(null);
    readonly detail = signal<ApplicationDetail | null>(null);
    readonly roster = signal<SquadPlayer[]>([]);
    readonly applications = signal<TournamentApplication[]>([]);
    readonly transfers = signal<TransferRequest[]>([]);
    readonly admins = signal<
        {
            userId: number;
            role: string;
            user: { username: string; firstName: string; lastName: string };
        }[]
    >([]);
    readonly memberCandidates = signal<CommunityUser[]>([]);
    readonly busy = signal(false);
    readonly loaded = signal(false);
    readonly error = signal('');
    readonly contextError = signal('');
    readonly notice = signal('');
    readonly reviewing = signal(false);
    readonly editing = signal(false);
    readonly cutoffReached = signal(false);
    readonly deadlineReached = signal(false);
    readonly editBlockedReason = computed(() =>
        this.cutoffReached()
            ? 'С начала 4-го тура изменение и утверждение заявок на турнир запрещено'
            : this.deadlineReached() &&
                !this.detail()?.application?.approvedRevisionId
              ? 'Срок подачи первоначальной заявки истёк'
              : (this.detail()?.editing.reason ?? ''),
    );
    readonly currentRevision = computed(() =>
        this.detail()?.revisions.find(
            (r) => r.id === this.detail()?.application?.currentRevisionId,
        ),
    );
    readonly approvedRevision = computed(() =>
        this.detail()?.revisions.find(
            (r) => r.id === this.detail()?.application?.approvedRevisionId,
        ),
    );
    readonly returnComment = computed(() =>
        this.detail()?.application?.status === 'changes_requested'
            ? ([...(this.detail()?.events ?? [])]
                  .reverse()
                  .find((e) => e.action === 'returned')?.comment ?? '')
            : '',
    );
    selectedPlayers: number[] = [];
    representatives = ['', ''];
    comment = '';
    transferComment = '';
    memberSearch = '';
    private savedForm = '';
    private savedSquad = '';
    private savedPolicy = '';
    private lockTimer?: ReturnType<typeof setTimeout>;
    private deadlineTimer?: ReturnType<typeof setTimeout>;
    readonly labels: Record<string, string> = {
        draft: 'Черновик',
        submitted: 'На рассмотрении',
        changes_requested: 'Нужна доработка',
        approved: 'Утверждена',
        saved: 'Сохранена версия',
        returned: 'Возвращена на доработку',
        open: 'Приём заявок открыт',
        closed: 'Приём заявок закрыт',
        not_open: 'Приём заявок ещё не открыт',
    };
    constructor() {
        inject(DestroyRef).onDestroy(() => this.clearTimers());
        void this.run(async () => {
            await this.loadWorkspace(true);
            if (!this.contextError()) await this.loadTournament();
        });
    }
    private async loadWorkspace(initial = false) {
        const workspace = await firstValueFrom(this.api.workspace());
        this.teams.set(workspace.teams);
        this.tournaments.set(workspace.tournaments);
        this.loaded.set(true);
        const query = this.route.snapshot.queryParamMap;
        if (initial && query.has('tournamentId')) {
            const id = Number(query.get('tournamentId'));
            if (
                !Number.isInteger(id) ||
                id <= 0 ||
                !workspace.tournaments.some((t) => t.id === id)
            ) {
                this.contextError.set(
                    'Турнир из ссылки недоступен. Выберите доступный турнир ниже.',
                );
                return;
            }
            this.tournamentId.set(id);
        } else if (
            !workspace.tournaments.some((t) => t.id === this.tournamentId())
        ) {
            this.tournamentId.set(workspace.tournaments[0]?.id ?? 0);
        }
        if (initial && query.has('teamId')) {
            const id = Number(query.get('teamId'));
            if (
                !Number.isInteger(id) ||
                id <= 0 ||
                !this.availableTeams().some((t) => t.teamId === id)
            ) {
                this.contextError.set(
                    'Команда из ссылки недоступна для этого турнира. Выберите свою опубликованную команду.',
                );
                return;
            }
            this.teamId.set(id);
        } else if (
            !this.availableTeams().some((t) => t.teamId === this.teamId())
        ) {
            this.teamId.set(this.availableTeams()[0]?.teamId ?? 0);
        }
        if (
            initial &&
            this.selectedTournament()?.canReview &&
            (query.get('mode') === 'management' ||
                query.has('section') ||
                (!query.has('teamId') && !this.teamId()))
        ) {
            this.mode.set('management');
        }
    }
    private formKey() {
        return JSON.stringify({
            players: [...this.selectedPlayers].sort((a, b) => a - b),
            representatives: this.representatives,
        });
    }
    private squadKey() {
        return JSON.stringify(
            [...this.selectedPlayers]
                .sort((a, b) => a - b)
                .map((id) => {
                    const link = this.roster().find(
                        (player) => player.playerId === id,
                    );
                    return {
                        id,
                        number: link?.shirtNumber,
                        captain: link?.isCaptain,
                        link: link?.id,
                    };
                }),
        );
    }
    applicationDirty() {
        return (
            !!this.detail() &&
            !this.reviewing() &&
            this.mode() === 'application' &&
            (this.formKey() !== this.savedForm ||
                (this.editing() && this.squadKey() !== this.savedSquad))
        );
    }
    policyDirty() {
        return (
            !!this.settings() &&
            this.savedPolicy !== JSON.stringify(this.settings()?.policy)
        );
    }
    hasUnsavedChanges() {
        return (
            this.applicationDirty() ||
            (this.mode() === 'management' &&
                (this.policyDirty() ||
                    !!this.comment.trim() ||
                    !!this.transferComment.trim()))
        );
    }
    canLeavePage() {
        return (
            !this.busy() &&
            (!this.hasUnsavedChanges() ||
                window.confirm(
                    'Есть несохранённые изменения. Продолжить и потерять их?',
                ))
        );
    }
    @HostListener('window:beforeunload', ['$event'])
    beforeUnload(event: BeforeUnloadEvent) {
        if (this.hasUnsavedChanges() || this.busy()) {
            event.preventDefault();
            event.returnValue = '';
        }
    }
    changeTournament(select: HTMLSelectElement) {
        const id = +select.value;
        select.value = String(this.tournamentId());
        void this.selectTournament(id);
    }
    changeTeam(select: HTMLSelectElement) {
        const id = +select.value;
        select.value = String(this.teamId());
        void this.selectTeam(id);
    }
    async selectTournament(id: number) {
        if (!this.canLeavePage()) return;
        this.tournamentId.set(Number(id));
        this.contextError.set('');
        this.teamId.set(this.availableTeams()[0]?.teamId ?? 0);
        if (!this.selectedTournament()?.canReview) this.mode.set('application');
        await this.run(async () => {
            await this.loadTournament();
            await this.syncUrl();
        });
    }
    async selectTeam(id: number) {
        if (!this.canLeavePage()) return;
        if (!this.availableTeams().some((t) => t.teamId === Number(id))) return;
        const previousId = this.teamId();
        this.teamId.set(Number(id));
        this.contextError.set('');
        await this.run(async () => {
            try {
                await this.loadTeam();
            } catch (error) {
                this.teamId.set(previousId);
                throw error;
            }
            await this.syncUrl();
        });
    }
    private syncUrl() {
        return this.router.navigate([], {
            relativeTo: this.route,
            replaceUrl: true,
            queryParams: {
                tournamentId: this.tournamentId() || null,
                teamId:
                    this.mode() === 'application'
                        ? this.teamId() || null
                        : null,
                mode: this.mode() === 'management' ? 'management' : null,
                section: this.mode() === 'management' ? this.section() : null,
            },
        });
    }
    async selectMode(mode: Mode) {
        if (mode === this.mode() || !this.canLeavePage()) return;
        if (mode === 'management' && !this.selectedTournament()?.canReview)
            return;
        this.mode.set(mode);
        await this.run(async () => {
            await this.loadTournament();
            await this.syncUrl();
        });
    }
    private clearTimers() {
        clearTimeout(this.lockTimer);
        clearTimeout(this.deadlineTimer);
    }
    private clearDetail() {
        this.clearTimers();
        this.detail.set(null);
        this.roster.set([]);
        this.reviewing.set(false);
        this.editing.set(false);
        this.comment = '';
        this.savedForm = '';
        this.cutoffReached.set(false);
        this.deadlineReached.set(false);
    }
    private async loadTournament() {
        this.clearDetail();
        this.settings.set(null);
        this.applications.set([]);
        this.transfers.set([]);
        this.admins.set([]);
        this.memberCandidates.set([]);
        this.savedPolicy = '';
        this.transferComment = '';
        const t = this.selectedTournament();
        if (!t) return;
        if (this.mode() === 'management') {
            if (!t.canReview) return;
            const settings = await firstValueFrom(this.api.settings(t.id));
            this.settings.set(settings);
            this.savedPolicy = JSON.stringify(settings.policy);
            this.applications.set(await firstValueFrom(this.api.list(t.id)));
            if (settings.canManageMembers) {
                this.admins.set(await firstValueFrom(this.api.members(t.id)));
                const memberships = await firstValueFrom(
                    this.communities.list(),
                );
                if (
                    memberships.some(
                        (c) => c.id === t.communityId && c.canManageTournaments,
                    )
                )
                    this.transfers.set(
                        await firstValueFrom(this.api.transfers(t.communityId)),
                    );
            }
        } else await this.loadTeam();
    }
    async selectWorkflow(step: TournamentWorkflowStep) {
        if (this.busy()) return;
        if (step === 'registration' || step === 'review') {
            if (step === this.section() || !this.canLeavePage()) return;
            if (this.policyDirty())
                this.settings.update((s) =>
                    s ? { ...s, policy: JSON.parse(this.savedPolicy) } : s,
                );
            this.section.set(step);
            this.clearDetail();
            this.transferComment = '';
            await this.syncUrl();
            return;
        }
        // The route's leave guard protects navigation to the builder.
        await this.router.navigate(
            ['/dashboard/tournaments', this.tournamentId(), 'edit'],
            { queryParams: { phase: step } },
        );
    }
    private async loadTeam() {
        const t = this.selectedTournament();
        if (!t || !this.teamId()) {
            this.clearDetail();
            return;
        }
        // Keep the previous form intact if refreshing fails.
        const [detail, roster] = await Promise.all([
            firstValueFrom(this.api.detail(t.id, this.teamId())),
            firstValueFrom(this.api.roster(t.communityId, this.teamId())),
        ]);
        this.reviewing.set(false);
        this.roster.set(roster);
        this.applyDetail(detail);
    }
    refreshApplication() {
        if (!this.canLeavePage()) return;
        return this.run(() => this.loadTeam());
    }
    private applyDetail(detail: ApplicationDetail) {
        this.detail.set(detail);
        this.scheduleApplicationLock(detail);
        const revision = detail.revisions.find(
            (r) => r.id === detail.application?.currentRevisionId,
        );
        this.selectedPlayers =
            revision?.snapshot.players.map((p) => p.playerId) ??
            this.roster()
                .slice(0, detail.policy.maxPlayers)
                .map((p) => p.playerId);
        this.representatives = [
            revision?.snapshot.representatives[0]?.name ?? '',
            revision?.snapshot.representatives[1]?.name ?? '',
        ];
        this.savedForm = this.formKey();
        this.savedSquad = revision
            ? JSON.stringify(
                  [...revision.snapshot.players]
                      .sort((a, b) => a.playerId - b.playerId)
                      .map((player) => ({
                          id: player.playerId,
                          number: player.shirtNumber,
                          captain: player.isCaptain,
                          link: player.teamPlayerId,
                      })),
              )
            : this.squadKey();
        this.editing.set(
            !detail.application ||
                ['draft', 'changes_requested'].includes(
                    detail.application.status,
                ),
        );
    }
    private scheduleApplicationLock(detail: ApplicationDetail) {
        this.clearTimers();
        this.cutoffReached.set(detail.editing.locked);
        this.deadlineReached.set(false);
        const now = new Date(detail.editing.serverNow).getTime();
        const arm = (
            remaining: number,
            reached: () => void,
        ): ReturnType<typeof setTimeout> | undefined => {
            if (remaining <= 0) {
                reached();
                return undefined;
            }
            const wait = Math.min(remaining, 2_147_483_647);
            return this.zone.runOutsideAngular(() =>
                setTimeout(() => {
                    this.zone.run(() => {
                        const next = arm(remaining - wait, reached);
                        if (reached === lock) this.lockTimer = next;
                        else this.deadlineTimer = next;
                    });
                }, wait),
            );
        };
        const lock = () => this.cutoffReached.set(true);
        if (!detail.editing.locked && detail.editing.locksAt)
            this.lockTimer = arm(
                new Date(detail.editing.locksAt).getTime() - now,
                lock,
            );
        if (!detail.application?.approvedRevisionId && detail.policy.deadline)
            this.deadlineTimer = arm(
                new Date(detail.policy.deadline).getTime() - now,
                () => this.deadlineReached.set(true),
            );
    }
    isEditing() {
        return (
            this.mode() === 'application' &&
            !this.reviewing() &&
            this.editing() &&
            !this.editBlockedReason()
        );
    }
    beginAmendment() {
        return this.run(async () => {
            await this.loadTeam();
            if (!this.editBlockedReason()) this.editing.set(true);
        });
    }
    cancelEditing() {
        if (
            this.applicationDirty() &&
            !window.confirm('Отменить несохранённые изменения заявки?')
        )
            return;
        const d = this.detail();
        if (d) this.applyDetail(d);
    }
    togglePlayer(id: number, checked: boolean) {
        if (!this.isEditing()) return;
        const max = this.detail()?.policy.maxPlayers ?? 12;
        if (
            checked &&
            this.selectedPlayers.length >= max &&
            !this.selectedPlayers.includes(id)
        )
            return;
        this.selectedPlayers = checked
            ? [...new Set([...this.selectedPlayers, id])]
            : this.selectedPlayers.filter((p) => p !== id);
    }
    unavailableSelectedPlayers() {
        return (this.currentRevision()?.snapshot.players ?? []).filter(
            (p) =>
                this.selectedPlayers.includes(p.playerId) &&
                !this.roster().some((link) => link.playerId === p.playerId),
        );
    }
    readiness() {
        const d = this.detail();
        if (!d) return [];
        const selected = this.roster().filter((p) =>
            this.selectedPlayers.includes(p.playerId),
        );
        const numbers = selected.map((p) => p.shirtNumber);
        const reps = this.representatives
            .map((name) => name.trim())
            .filter(Boolean);
        return [
            {
                ok:
                    this.selectedPlayers.length >= d.policy.minPlayers &&
                    this.selectedPlayers.length <= d.policy.maxPlayers,
                text: `Выбрано ${this.selectedPlayers.length} игроков · требуется от ${d.policy.minPlayers} до ${d.policy.maxPlayers}`,
            },
            {
                ok: selected.length === this.selectedPlayers.length,
                text: 'Все выбранные игроки есть в текущем составе',
            },
            {
                ok: selected.filter((p) => p.isCaptain).length === 1,
                text: 'Выбран ровно один игровой капитан',
            },
            {
                ok:
                    numbers.every(
                        (n) => Number.isInteger(n) && n! >= 1 && n! <= 99,
                    ) && new Set(numbers).size === numbers.length,
                text: 'У игроков указаны разные номера от 1 до 99',
            },
            {
                ok:
                    reps.length <= d.policy.maxRepresentatives &&
                    new Set(reps.map((name) => name.toLocaleLowerCase('ru')))
                        .size === reps.length,
                text: `Представители не повторяются · не более ${d.policy.maxRepresentatives}`,
            },
        ];
    }
    readyToSubmit() {
        return !!this.detail() && this.readiness().every((item) => item.ok);
    }
    save(submit = false) {
        return this.run(async () => {
            let detail = this.detail();
            if (!detail || this.reviewing() || this.mode() !== 'application')
                return;
            if (this.editBlockedReason()) {
                this.error.set(this.editBlockedReason());
                return;
            }
            if (!this.editing()) return;
            if (submit && !this.readyToSubmit()) {
                this.error.set(
                    'Исправьте заявку перед отправкой: ' +
                        this.readiness()
                            .filter((item) => !item.ok)
                            .map((item) => item.text)
                            .join('. '),
                );
                return;
            }
            let saved = detail.application;
            if (
                !saved?.currentRevisionId ||
                saved.status === 'approved' ||
                this.applicationDirty()
            ) {
                saved = await firstValueFrom(
                    this.api.save(
                        this.tournamentId(),
                        this.teamId(),
                        this.selectedPlayers,
                        this.representatives
                            .map((name) => ({ name: name.trim() }))
                            .filter((r) => r.name),
                        detail.application?.currentRevisionId ?? undefined,
                    ),
                );
                // Adopt the committed revision immediately, even if submit or a subsequent GET fails.
                detail = { ...detail, application: saved };
                this.detail.set(detail);
                this.savedForm = this.formKey();
                this.savedSquad = this.squadKey();
                this.editing.set(true);
            }
            if (submit && saved?.currentRevisionId) {
                try {
                    await firstValueFrom(
                        this.api.submit(
                            this.tournamentId(),
                            this.teamId(),
                            saved.currentRevisionId,
                        ),
                    );
                    this.detail.update((d) =>
                        d
                            ? {
                                  ...d,
                                  application: {
                                      ...saved!,
                                      status: 'submitted',
                                  },
                              }
                            : d,
                    );
                    this.editing.set(false);
                } catch (error) {
                    await this.refreshSavedDetail();
                    if (this.detail()?.application?.status === 'submitted') {
                        this.notice.set('Заявка отправлена на рассмотрение');
                        return;
                    }
                    this.notice.set(
                        'Черновик сохранён, но заявка не отправлена. Исправьте указанную ошибку и повторите отправку.',
                    );
                    throw error;
                }
            }
            const refreshed = await this.refreshSavedDetail();
            this.notice.set(
                (submit
                    ? 'Заявка отправлена на рассмотрение'
                    : 'Черновик сохранён') +
                    (refreshed
                        ? ''
                        : '. Не удалось обновить просмотр: нажмите «Обновить заявку». Сохранённая версия не потеряна.'),
            );
        });
    }
    private async refreshSavedDetail() {
        try {
            this.applyDetail(
                await firstValueFrom(
                    this.api.detail(this.tournamentId(), this.teamId()),
                ),
            );
            return true;
        } catch {
            return false;
        }
    }
    registration(action: 'open' | 'close') {
        if (
            action === 'close' &&
            !window.confirm(
                'Закрыть приём новых заявок? Уже отправленные заявки останутся на рассмотрении.',
            )
        )
            return;
        return this.run(async () => {
            const settings = this.settings();
            if (
                settings &&
                (this.policyDirty() ||
                    (action === 'open' &&
                        !settings.tournament.registrationOpenedAt))
            )
                await firstValueFrom(
                    this.api.policy(this.tournamentId(), settings.policy),
                );
            await firstValueFrom(
                this.api.registration(this.tournamentId(), action),
            );
            await this.loadWorkspace();
            await this.loadTournament();
            this.notice.set(
                action === 'open'
                    ? 'Капитаны могут подавать заявки'
                    : 'Приём новых заявок закрыт. Рассмотрите отправленные заявки перед запуском',
            );
            if (action === 'close') this.section.set('review');
            await this.syncUrl();
        });
    }
    savePolicy() {
        return this.run(async () => {
            const settings = this.settings();
            if (!settings) return;
            await firstValueFrom(
                this.api.policy(this.tournamentId(), settings.policy),
            );
            await this.loadTournament();
            this.notice.set('Настройки заявки сохранены');
        });
    }
    viewApplication(app: TournamentApplication) {
        if (!this.canLeavePage()) return;
        return this.run(async () => {
            const detail = await firstValueFrom(
                this.api.detail(this.tournamentId(), app.teamId),
            );
            this.comment = '';
            this.reviewing.set(true);
            this.applyDetail(detail);
        });
    }
    review(decision: 'approve' | 'return') {
        return this.run(async () => {
            if (
                decision === 'approve' &&
                (this.cutoffReached() ||
                    this.detail()?.tournament.lifecycleStatus === 'completed')
            ) {
                this.error.set(this.editBlockedReason() || 'Турнир завершён');
                return;
            }
            const app = this.detail()?.application;
            if (
                !app?.currentRevisionId ||
                (decision === 'return' && !this.comment.trim())
            )
                return;
            await firstValueFrom(
                this.api.review(
                    this.tournamentId(),
                    app.id,
                    app.currentRevisionId,
                    decision,
                    this.comment,
                ),
            );
            this.comment = '';
            // Keep the reviewed team in view, rather than switching back to the organizer's own team.
            this.applyDetail(
                await firstValueFrom(
                    this.api.detail(this.tournamentId(), app.teamId),
                ),
            );
            this.applications.set(
                await firstValueFrom(this.api.list(this.tournamentId())),
            );
            this.notice.set(
                decision === 'approve'
                    ? 'Заявка утверждена. Команда допущена к турниру'
                    : 'Заявка возвращена с комментарием',
            );
        });
    }
    reviewTransfer(id: number, decision: 'approve' | 'reject') {
        return this.run(async () => {
            const t = this.selectedTournament();
            if (!t) return;
            await firstValueFrom(
                this.api.reviewTransfer(
                    t.communityId,
                    id,
                    decision,
                    this.transferComment,
                ),
            );
            this.transferComment = '';
            this.transfers.set(
                await firstValueFrom(this.api.transfers(t.communityId)),
            );
            this.notice.set('Решение по переходу сохранено');
        });
    }
    searchMembers() {
        return this.run(async () => {
            const c = this.selectedTournament()?.communityId;
            if (c)
                this.memberCandidates.set(
                    (
                        await firstValueFrom(
                            this.communities.members(c, this.memberSearch),
                        )
                    ).items,
                );
        });
    }
    setAdmin(userId: number) {
        if (
            !window.confirm(
                'Выдать этому участнику права администратора выбранного турнира?',
            )
        )
            return;
        return this.run(async () => {
            await firstValueFrom(
                this.api.setAdmin(this.tournamentId(), userId),
            );
            this.admins.set(
                await firstValueFrom(this.api.members(this.tournamentId())),
            );
            this.notice.set(
                'Назначен администратор этого турнира. Права сообщества не изменены',
            );
        });
    }
    removeAdmin(userId: number) {
        const admin = this.admins().find((a) => a.userId === userId);
        if (
            !window.confirm(
                `Отозвать доступ к турниру у ${admin?.user.lastName ?? ''} ${admin?.user.firstName ?? ''}?`,
            )
        )
            return;
        return this.run(async () => {
            await firstValueFrom(
                this.api.removeAdmin(this.tournamentId(), userId),
            );
            this.admins.set(
                await firstValueFrom(this.api.members(this.tournamentId())),
            );
            this.notice.set('Доступ к турниру отозван');
        });
    }
    private async run(action: () => Promise<void>) {
        if (this.busy()) return;
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
                          'Не удалось выполнить действие. Попробуйте ещё раз.',
            );
        } finally {
            this.busy.set(false);
        }
    }
}
