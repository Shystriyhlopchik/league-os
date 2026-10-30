import {
    CdkDragDrop,
    DragDropModule,
    moveItemInArray,
} from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    OnInit,
    computed,
    inject,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CommunityApi } from '../../../entities/community/community.api';
import {
    ManagedCalendar,
    ManualScheduleMatch,
    TournamentApplicationApi,
} from '../../../entities/tournament-application/tournament-application.api';
import {
    TournamentWorkflowComponent,
    TournamentWorkflowStep,
} from '../../../shared/ui/tournament-workflow/tournament-workflow.component';

import { Team } from '../../../entities/team/model/team.types';
import { TeamsApi } from '../../../entities/team/api/teams.api';
import {
    SavedTournamentDraftSummary,
    TieBreakerType,
    TournamentBuilderDraft,
    TournamentParticipantDraft,
    TournamentStageDraft,
    TournamentValidationIssue,
} from '../model/tournament-builder.types';
import {
    TOURNAMENT_TEMPLATES,
    createTournamentTemplate,
} from '../model/tournament-templates';
import {
    buildTournamentRules,
    stageConfiguration,
} from '../model/tournament-builder.mapper';
import { TournamentBuilderStore } from '../model/tournament-builder.store';
import {
    TournamentBuilderApi,
    TournamentBuilderSnapshot,
} from '../api/tournament-builder.api';
import {
    TournamentWizardStep,
    TournamentWizardStepperComponent,
} from './tournament-wizard-stepper.component';

const STEP_ERROR_HINTS: string[][] = [
    ['name', 'slug', 'season', 'startDate', 'endDate'],
    ['stages', 'stageKey', 'type'],
    ['participants', 'teams', 'team'],
    ['groups', 'group'],
    ['scoring', 'standings', 'tieBreakers'],
    ['transitions', 'qualification'],
    ['bracket', 'seeding'],
    ['match', 'extraTime', 'penalties'],
    ['discipline'],
    ['$'],
];

@Component({
    selector: 'app-tournament-builder-page',
    imports: [
        CommonModule,
        FormsModule,
        RouterLink,
        DragDropModule,
        TournamentWizardStepperComponent,
        TournamentWorkflowComponent,
    ],
    providers: [TournamentBuilderStore],
    templateUrl: './tournament-builder-page.component.html',
    styleUrl: './tournament-builder-page.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentBuilderPageComponent implements OnInit {
    readonly store = inject(TournamentBuilderStore);
    private readonly route = inject(ActivatedRoute);
    private readonly teamsApi = inject(TeamsApi);
    private readonly api = inject(TournamentBuilderApi);
    private readonly communitiesApi = inject(CommunityApi);
    private readonly registrationsApi = inject(TournamentApplicationApi);
    private readonly router = inject(Router);
    readonly workflowPhase = signal<'setup' | 'preparation' | 'launch'>(
        'setup',
    );
    readonly preparedCalendar = signal<ManagedCalendar | null>(null);
    readonly manualEditorOpen = signal(false);
    readonly manualMatchError = signal('');
    readonly removeMatchConfirmation = signal<number | null>(null);
    editingMatchId?: number;
    manualMatch: ManualScheduleMatch = {
        groupId: 0,
        roundNumber: 1,
        homeTeamId: 0,
        awayTeamId: 0,
    };
    readonly canEditPairings = computed(
        () =>
            !this.store.structureLocked() &&
            (!this.applicationsRequired() ||
                this.draft().registrationStatus === 'closed'),
    );
    resetCalendarConfirmed = false;
    readonly availableCommunities = signal<{ id: number; name: string }[]>([]);
    readonly availableSeasons = signal<
        {
            id: number;
            name: string;
            communityId: number;
            competitionName: string;
        }[]
    >([]);
    readonly selectedCommunityId = signal(0);
    readonly communitySeasons = computed(() =>
        this.availableSeasons().filter(
            (s) => s.communityId === this.selectedCommunityId(),
        ),
    );

    readonly templates = TOURNAMENT_TEMPLATES;
    readonly steps: TournamentWizardStep[] = [
        { shortTitle: 'Основное', title: 'Основная информация' },
        { shortTitle: 'Этапы', title: 'Формат и этапы' },
        { shortTitle: 'Команды', title: 'Принятые заявки' },
        { shortTitle: 'Группы', title: 'Распределение по группам' },
        { shortTitle: 'Таблица', title: 'Очки и тай-брейки' },
        { shortTitle: 'Отбор', title: 'Правила квалификации' },
        { shortTitle: 'Плей-офф', title: 'Формат и посев' },
        { shortTitle: 'Матч', title: 'Определение победителя' },
        { shortTitle: 'Карточки', title: 'Дисциплина' },
        { shortTitle: 'Проверка', title: 'Проверка настроек и создание' },
    ];
    readonly visibleSteps = computed(() =>
        this.steps
            .map((step, index) => ({ ...step, index }))
            .filter((step) =>
                this.workflowPhase() === 'launch'
                    ? step.index === 9
                    : this.workflowPhase() === 'preparation'
                      ? [2, 3].includes(step.index)
                      : ![2, 3].includes(step.index),
            ),
    );
    readonly visibleStepIndex = computed(() =>
        Math.max(
            0,
            this.visibleSteps().findIndex((s) => s.index === this.activeStep()),
        ),
    );
    readonly visibleErrorSteps = computed(() =>
        this.visibleSteps()
            .map((s, i) => (this.stepIssueCount(s.index) > 0 ? i : -1))
            .filter((i) => i >= 0),
    );
    readonly applicationsRequired = computed(
        () => this.draft().registrationRequired ?? !this.draft().tournamentId,
    );
    readonly tieBreakerOptions: Array<{
        value: TieBreakerType;
        label: string;
    }> = [
        { value: 'points', label: 'Очки' },
        { value: 'head_to_head', label: 'Личные встречи' },
        { value: 'wins', label: 'Победы' },
        { value: 'goal_difference', label: 'Разница мячей' },
        { value: 'goals_for', label: 'Забитые мячи' },
        { value: 'goals_against', label: 'Пропущенные мячи' },
        { value: 'disciplinary_score', label: 'Дисциплинарный рейтинг' },
        { value: 'technical_loss', label: 'Поражение по решению ГСК' },
        { value: 'manual_decision', label: 'Ручное решение' },
        { value: 'draw', label: 'Жребий' },
    ];

    readonly teams = signal<Team[]>([]);
    readonly teamsLoading = signal(false);
    readonly operation = signal<
        'save' | 'validate' | 'publish' | 'calendar' | null
    >(null);
    readonly savedDrafts = signal<SavedTournamentDraftSummary[]>([]);
    readonly selectedCloneKey = signal('');
    readonly cloneTournamentId = signal<number | null>(null);
    readonly newTieBreaker = signal<TieBreakerType>('goal_difference');

    readonly draft = this.store.draft;
    readonly activeStep = computed(() => this.draft().currentStep);
    readonly groupStage = computed(() =>
        this.draft().stages.find((stage) => stage.type === 'group_stage'),
    );
    readonly knockoutStage = computed(() =>
        this.draft().stages.find((stage) => stage.type === 'knockout'),
    );
    readonly errorSteps = computed(() =>
        this.steps
            .map((_, index) => index)
            .filter((index) => this.stepIssueCount(index) > 0),
    );
    readonly selectedTeamIds = computed(
        () => new Set(this.draft().participants.map((item) => item.teamId)),
    );
    readonly expectedTeamCount = computed(() => {
        const groupStage = this.groupStage();
        if (groupStage?.groups.length) {
            return groupStage.groups.reduce(
                (sum, group) => sum + (group.capacity ?? 0),
                0,
            );
        }
        return this.knockoutStage()?.bracketSize ?? 0;
    });

    ngOnInit(): void {
        const tournamentId =
            this.route.snapshot.paramMap.get('tournamentId') ?? undefined;
        const restored = this.store.initialize(tournamentId);
        const phase = this.route.snapshot.queryParamMap.get('phase');
        if (phase === 'preparation' || phase === 'launch') {
            this.workflowPhase.set(phase);
            this.store.mutate((d) => {
                d.currentStep = phase === 'preparation' ? 3 : 9;
            });
        } else if ([2, 3].includes(this.activeStep())) this.goToStep(0);
        void this.loadCommunitySeasons();
        this.savedDrafts.set(this.store.listSavedDrafts());
        this.loadTeams();
        this.refreshLocalPreviews();
        if (tournamentId && !restored) {
            void this.loadServerDraft(Number(tournamentId));
        } else if (tournamentId) {
            void this.refreshAcceptedTeams(Number(tournamentId));
        }
    }

    selectCommunity(id: number): void {
        if (this.store.structureLocked() || this.draft().tournamentId) return;
        this.selectedCommunityId.set(id);
        this.updateDetails('seasonId', this.communitySeasons()[0]?.id ?? 0);
    }

    private async loadCommunitySeasons(): Promise<void> {
        try {
            const communities = (
                await firstValueFrom(this.communitiesApi.list())
            ).filter((c) => c.canManageTournaments);
            this.availableCommunities.set(communities);
            const contexts = await Promise.all(
                communities.map((c) =>
                    firstValueFrom(this.communitiesApi.context(c.id)),
                ),
            );
            this.availableSeasons.set(
                contexts.flatMap((context) =>
                    context.competitions.flatMap((c) =>
                        c.seasons.map((s) => ({
                            id: s.id,
                            name: s.name,
                            communityId: context.community.id,
                            competitionName: c.name,
                        })),
                    ),
                ),
            );
            const query = this.route.snapshot.queryParamMap;
            const requestedCommunityId = !this.draft().tournamentId
                ? Number(query.get('communityId'))
                : 0;
            const seasonId =
                !this.draft().tournamentId && query.has('seasonId')
                    ? Number(query.get('seasonId'))
                    : this.draft().details.seasonId;
            const matchingSeason = this.availableSeasons().find(
                (s) => s.id === seasonId,
            );
            const selectedId = communities.some(
                (c) => c.id === requestedCommunityId,
            )
                ? requestedCommunityId
                : (matchingSeason?.communityId ?? communities[0]?.id ?? 0);
            this.selectedCommunityId.set(selectedId);
            if (!this.draft().tournamentId)
                this.updateDetails(
                    'seasonId',
                    this.communitySeasons().find((s) => s.id === seasonId)
                        ?.id ??
                        this.communitySeasons()[0]?.id ??
                        0,
                );
        } catch (error) {
            this.applyBackendError(error);
        }
    }

    goToStep(step: number): void {
        this.store.patch({
            currentStep: Math.max(0, Math.min(this.steps.length - 1, step)),
        });
    }

    next(): void {
        this.goToStep(
            this.visibleSteps()[this.visibleStepIndex() + 1]?.index ??
                this.activeStep(),
        );
    }

    previous(): void {
        this.goToStep(
            this.visibleSteps()[this.visibleStepIndex() - 1]?.index ??
                this.activeStep(),
        );
    }

    async selectWorkflow(step: TournamentWorkflowStep): Promise<void> {
        if (this.operation()) return;
        if (step === 'registration' || step === 'review') {
            if (this.store.dirty()) await this.saveDraft();
            if (!this.draft().tournamentId || this.store.dirty()) return;
            await this.router.navigate(['/dashboard/tournament-applications'], {
                queryParams: {
                    tournamentId: this.draft().tournamentId,
                    section: step,
                },
            });
            return;
        }
        this.workflowPhase.set(step);
        this.goToStep(step === 'setup' ? 0 : step === 'preparation' ? 3 : 9);
        if (step === 'preparation') await this.loadPreparationCalendar();
    }

    selectVisibleStep(index: number): void {
        this.goToStep(this.visibleSteps()[index]?.index ?? 0);
    }

    private async loadPreparationCalendar(): Promise<void> {
        if (
            !this.draft().tournamentId ||
            this.workflowPhase() !== 'preparation'
        )
            return;
        try {
            this.preparedCalendar.set(
                await firstValueFrom(
                    this.registrationsApi.calendar(this.draft().tournamentId!),
                ),
            );
        } catch (error) {
            this.applyBackendError(error);
        }
    }

    async generateCalendar(): Promise<void> {
        if (this.operation()) return;
        await this.saveDraft();
        const stage = this.groupStage();
        if (
            this.store.dirty() ||
            !this.draft().tournamentId ||
            !stage?.serverId
        )
            return;
        this.operation.set('calendar');
        try {
            await firstValueFrom(
                this.registrationsApi.generateSchedule(
                    this.draft().tournamentId!,
                    stage.serverId,
                    stage.legs,
                ),
            );
            await this.loadPreparationCalendar();
            this.store.notice.set(
                'Пары сформированы. Назначьте всем матчам дату, время и площадку. До запуска они скрыты из публичного календаря.',
            );
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    async openManualMatch(
        match?: ManagedCalendar['matches'][number],
    ): Promise<void> {
        if (this.operation() || !this.canEditPairings()) return;
        if (this.store.dirty()) await this.saveDraft();
        const stage = this.groupStage();
        if (
            this.store.dirty() ||
            !stage?.serverId ||
            !this.draft().tournamentId
        )
            return;
        this.editingMatchId = match?.id;
        this.manualMatch = {
            groupId: match?.groupId ?? stage.groups[0]?.serverId ?? 0,
            roundNumber: match?.roundNumber ?? 1,
            homeTeamId: match?.homeTeamId ?? 0,
            awayTeamId: match?.awayTeamId ?? 0,
        };
        this.manualMatchError.set('');
        this.removeMatchConfirmation.set(null);
        this.manualEditorOpen.set(true);
    }

    manualGroupTeams(): TournamentParticipantDraft[] {
        const group = this.groupStage()?.groups.find(
            (g) => g.serverId === this.manualMatch.groupId,
        );
        return group
            ? this.draft().participants.filter((p) => p.groupKey === group.key)
            : [];
    }

    changeManualGroup(groupId: number): void {
        this.manualMatch = {
            ...this.manualMatch,
            groupId,
            homeTeamId: 0,
            awayTeamId: 0,
        };
        this.manualMatchError.set('');
    }

    async saveManualMatch(): Promise<void> {
        const stageId = this.groupStage()?.serverId;
        const tournamentId = this.draft().tournamentId;
        if (
            this.operation() ||
            !this.canEditPairings() ||
            !stageId ||
            !tournamentId
        )
            return;
        const body = { ...this.manualMatch };
        if (
            !body.groupId ||
            !body.homeTeamId ||
            !body.awayTeamId ||
            !Number.isInteger(body.roundNumber) ||
            body.roundNumber < 1 ||
            body.roundNumber > 10000
        ) {
            this.manualMatchError.set(
                'Выберите группу, две команды и целый номер тура от 1 до 10000.',
            );
            return;
        }
        if (body.homeTeamId === body.awayTeamId) {
            this.manualMatchError.set('Выберите разные команды.');
            return;
        }
        this.operation.set('calendar');
        this.manualMatchError.set('');
        try {
            await firstValueFrom(
                this.registrationsApi.saveManualMatch(
                    tournamentId,
                    stageId,
                    body,
                    this.editingMatchId,
                ),
            );
            this.manualEditorOpen.set(false);
            await this.loadPreparationCalendar();
            this.store.notice.set(
                'Матч сохранён. Проверьте дату, время и площадку. Перед запуском календарь должен быть полным.',
            );
        } catch (error) {
            this.applyBackendError(error);
            this.manualMatchError.set(
                this.store.notice() ?? 'Не удалось сохранить матч.',
            );
        } finally {
            this.operation.set(null);
        }
    }

    async removePreparedMatch(matchId: number): Promise<void> {
        const stageId = this.groupStage()?.serverId;
        const tournamentId = this.draft().tournamentId;
        if (
            this.operation() ||
            !this.canEditPairings() ||
            !stageId ||
            !tournamentId ||
            this.removeMatchConfirmation() !== matchId
        )
            return;
        this.operation.set('calendar');
        try {
            await firstValueFrom(
                this.registrationsApi.removeManualMatch(
                    tournamentId,
                    stageId,
                    matchId,
                ),
            );
            this.removeMatchConfirmation.set(null);
            if (this.editingMatchId === matchId)
                this.manualEditorOpen.set(false);
            await this.loadPreparationCalendar();
            this.store.notice.set(
                'Матч убран из календаря. История сохранена; перед запуском добавьте недостающую пару.',
            );
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    async resetCalendar(): Promise<void> {
        if (
            !this.resetCalendarConfirmed ||
            this.operation() ||
            !this.groupStage()?.serverId ||
            !this.draft().tournamentId
        )
            return;
        this.operation.set('calendar');
        try {
            await firstValueFrom(
                this.registrationsApi.resetCalendar(
                    this.draft().tournamentId!,
                    this.groupStage()!.serverId!,
                ),
            );
            this.resetCalendarConfirmed = false;
            this.manualEditorOpen.set(false);
            await this.loadPreparationCalendar();
            this.store.notice.set(
                'Подготовленные матчи отменены и скрыты. Можно изменить группы и сформировать новые пары. История матчей сохранена.',
            );
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    async schedulePreparedMatch(
        matchId: number,
        datetime: string,
        venueId: number,
    ): Promise<void> {
        if (this.operation() || !this.draft().tournamentId) return;
        this.operation.set('calendar');
        try {
            await firstValueFrom(
                this.registrationsApi.schedule(
                    this.draft().tournamentId!,
                    matchId,
                    datetime,
                    venueId,
                ),
            );
            await this.loadPreparationCalendar();
            this.store.notice.set(
                'Дата и площадка сохранены. Матч появится в публичном календаре после запуска турнира.',
            );
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    applyTemplate(templateId: TournamentBuilderDraft['templateId']): void {
        if (this.store.structureLocked()) return;
        if (templateId === 'clone') {
            this.savedDrafts.set(this.store.listSavedDrafts());
            this.store.patch({ templateId });
            return;
        }
        this.store.applyTemplate(templateId);
        this.refreshLocalPreviews();
    }

    cloneSelected(): void {
        const key = this.selectedCloneKey();
        if (!key) return;
        if (!this.store.cloneFrom(key)) {
            this.store.notice.set('Не удалось прочитать выбранный черновик');
            return;
        }
        this.refreshLocalPreviews();
    }

    async cloneFromServer(): Promise<void> {
        const tournamentId = this.cloneTournamentId();
        if (!tournamentId || this.operation()) return;
        this.operation.set('save');
        try {
            const snapshot = await firstValueFrom(
                this.api.loadBuilder(tournamentId),
            );
            const copy = this.fromSnapshot(snapshot);
            copy.localId = crypto.randomUUID();
            copy.tournamentId = undefined;
            copy.ruleVersionId = undefined;
            copy.lifecycleStatus = 'draft';
            copy.templateId = 'clone';
            copy.details.name = `${copy.details.name} — копия`;
            copy.details.slug = `${copy.details.slug}-copy`;
            copy.stages.forEach((stage) => {
                stage.serverId = undefined;
                stage.groups.forEach((group) => {
                    group.serverId = undefined;
                });
            });
            copy.participants.forEach((participant) => {
                participant.tournamentTeamId = undefined;
                participant.stageParticipantId = undefined;
            });
            copy.removedStageParticipantIds = [];
            this.store.replace(copy);
            this.store.notice.set('Создана копия серверного турнира');
            this.refreshLocalPreviews();
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    updateDetails<K extends keyof TournamentBuilderDraft['details']>(
        key: K,
        value: TournamentBuilderDraft['details'][K],
    ): void {
        this.store.mutate((draft) => {
            draft.details[key] = value;
            if (key === 'name' && !draft.details.slug) {
                draft.details.slug = this.slugify(String(value));
            }
        });
    }

    addStage(): void {
        if (this.store.structureLocked()) return;
        this.store.mutate((draft) => {
            const order = draft.stages.length + 1;
            draft.stages.push({
                clientKey: crypto.randomUUID(),
                key: `stage-${order}`,
                name: `Этап ${order}`,
                type: 'round_robin',
                order,
                startDate: '',
                endDate: '',
                legs: 1,
                groups: [],
            });
        });
    }

    updateStage(
        stageKey: string,
        key: keyof TournamentStageDraft,
        value: unknown,
    ): void {
        if (this.store.structureLocked()) return;
        this.store.mutate((draft) => {
            const stage = draft.stages.find(
                (item) => item.clientKey === stageKey,
            );
            if (!stage) return;
            (stage as unknown as Record<string, unknown>)[key] = value;
            if (key === 'type') {
                if (value === 'group_stage' && stage.groups.length === 0) {
                    stage.groups = this.createGroups(stage.key, 2, 4);
                }
                if (value !== 'group_stage') stage.groups = [];
                if (value === 'knockout') {
                    stage.bracketSize = 4;
                    stage.thirdPlaceMatch = false;
                }
            }
        });
        this.refreshLocalPreviews();
    }

    removeStage(stageKey: string): void {
        if (this.store.structureLocked()) return;
        this.store.mutate((draft) => {
            draft.stages = draft.stages
                .filter((stage) => stage.clientKey !== stageKey)
                .map((stage, index) => ({ ...stage, order: index + 1 }));
        });
        this.refreshLocalPreviews();
    }

    setGroupCount(stageKey: string, count: number): void {
        if (this.store.structureLocked()) return;
        const safeCount = Math.max(1, Math.min(16, Number(count) || 1));
        this.store.mutate((draft) => {
            const stage = draft.stages.find(
                (item) => item.clientKey === stageKey,
            );
            if (!stage) return;
            const capacity = stage.groups[0]?.capacity ?? 4;
            stage.groups = this.createGroups(
                stage.key,
                safeCount,
                capacity,
            ).map((group, i) => stage.groups[i] ?? group);
            for (const participant of draft.participants) {
                if (
                    participant.groupKey &&
                    !stage.groups.some(
                        (group) => group.key === participant.groupKey,
                    )
                ) {
                    participant.groupKey = undefined;
                }
            }
        });
        this.refreshLocalPreviews();
    }

    setGroupCapacity(
        stageKey: string,
        groupKey: string,
        capacity: number,
    ): void {
        const safeCapacity = Math.max(2, Math.min(32, Number(capacity) || 2));
        this.store.mutate((draft) => {
            const stage = draft.stages.find(
                (item) => item.clientKey === stageKey,
            );
            const group = stage?.groups.find((item) => item.key === groupKey);
            if (group) group.capacity = safeCapacity;
        });
        this.refreshLocalPreviews();
    }

    toggleTeam(team: Team): void {
        if (this.draft().registrationRequired ?? !this.draft().tournamentId) {
            this.store.notice.set(
                'Участники появятся после утверждения заявок. Сохраните турнир и откройте раздел заявок',
            );
            return;
        }
        if (this.store.structureLocked()) return;
        this.store.mutate((draft) => {
            const index = draft.participants.findIndex(
                (participant) => participant.teamId === team.id,
            );
            if (index >= 0) {
                const removed = draft.participants[index];
                if (removed.stageParticipantId) {
                    draft.removedStageParticipantIds.push(
                        removed.stageParticipantId,
                    );
                }
                draft.participants.splice(index, 1);
            } else {
                draft.participants.push({
                    teamId: team.id,
                    name: team.name,
                    shortName: team.shortName,
                    logoUrl: team.logoUrl,
                });
            }
        });
        this.refreshLocalPreviews();
    }

    firstErrorStep(): number {
        return this.errorSteps()[0] ?? 0;
    }

    setParticipantGroup(teamId: number, groupKey: string): void {
        if (this.store.structureLocked()) return;
        this.store.mutate((draft) => {
            const participant = draft.participants.find(
                (item) => item.teamId === teamId,
            );
            if (participant) participant.groupKey = groupKey || undefined;
        });
        this.refreshLocalPreviews();
    }

    distributeGroups(
        strategy: TournamentBuilderDraft['groupAssignmentStrategy'],
    ): void {
        if (this.store.structureLocked()) return;
        const groups = this.groupStage()?.groups ?? [];
        if (!groups.length) return;
        this.store.mutate((draft) => {
            draft.groupAssignmentStrategy = strategy;
            let participants = draft.participants;
            if (strategy === 'random') {
                participants = participants
                    .slice()
                    .sort(() => Math.random() - 0.5);
            }
            if (strategy === 'pots') {
                participants = participants
                    .slice()
                    .sort(
                        (a, b) =>
                            (a.pot ?? Number.MAX_SAFE_INTEGER) -
                            (b.pot ?? Number.MAX_SAFE_INTEGER),
                    );
            }
            participants.forEach((participant, index) => {
                const cycle = Math.floor(index / groups.length);
                const offset = index % groups.length;
                const groupIndex =
                    strategy === 'pots' && cycle % 2 === 1
                        ? groups.length - 1 - offset
                        : offset;
                participant.groupKey = groups[groupIndex].key;
            });
        });
        this.refreshLocalPreviews();
    }

    participantsForGroup(groupKey: string): TournamentParticipantDraft[] {
        return this.draft().participants.filter(
            (participant) => participant.groupKey === groupKey,
        );
    }

    dropTieBreaker(event: CdkDragDrop<TieBreakerType[]>): void {
        if (this.store.structureLocked()) return;
        this.store.mutate((draft) => {
            moveItemInArray(
                draft.tieBreakers,
                event.previousIndex,
                event.currentIndex,
            );
        });
    }

    addTieBreaker(): void {
        const value = this.newTieBreaker();
        if (this.draft().tieBreakers.includes(value)) return;
        this.store.mutate((draft) => draft.tieBreakers.push(value));
    }

    removeTieBreaker(value: TieBreakerType): void {
        this.store.mutate((draft) => {
            draft.tieBreakers = draft.tieBreakers.filter(
                (item) => item !== value,
            );
        });
    }

    tieBreakerLabel(value: TieBreakerType): string {
        return (
            this.tieBreakerOptions.find((option) => option.value === value)
                ?.label ?? value
        );
    }

    fieldError(...paths: string[]): string | null {
        const issues = this.store.validationIssues();
        return (
            issues.find((issue) =>
                paths.some(
                    (path) =>
                        issue.path === path ||
                        issue.path.includes(path) ||
                        path.includes(issue.path),
                ),
            )?.message ?? null
        );
    }

    stepIssueCount(step: number): number {
        const hints = STEP_ERROR_HINTS[step] ?? [];
        return this.store
            .validationIssues()
            .filter((issue) =>
                hints.some(
                    (hint) => issue.path === hint || issue.path.includes(hint),
                ),
            ).length;
    }

    async saveDraft(): Promise<void> {
        if (this.operation()) return;
        const creating = !this.draft().tournamentId;
        this.operation.set('save');
        this.store.saving.set(true);
        this.store.notice.set(null);
        this.store.setIssues(this.localValidation());
        if (
            this.store
                .validationIssues()
                .some((issue) => issue.code === 'required')
        ) {
            this.store.notice.set('Заполните обязательные поля');
            this.operation.set(null);
            this.store.saving.set(false);
            return;
        }

        try {
            let draft = this.draft();
            const detailsPayload = this.store.structureLocked()
                ? this.compact({
                      name: draft.details.name,
                      description: draft.details.description,
                      colorPrimary: draft.details.colorPrimary,
                      colorSecondary: draft.details.colorSecondary,
                      logoUrl: draft.details.logoUrl,
                  })
                : this.compact({
                      ...draft.details,
                      seasonId: Number(draft.details.seasonId),
                      communityId: this.availableSeasons().find(
                          (s) => s.id === Number(draft.details.seasonId),
                      )?.communityId,
                  });
            const tournament = draft.tournamentId
                ? await firstValueFrom(
                      this.api.updateTournament(
                          draft.tournamentId,
                          detailsPayload,
                      ),
                  )
                : await firstValueFrom(
                      this.api.createTournament(detailsPayload),
                  );

            this.store.patch({
                registrationRequired: tournament.registrationRequired,
                registrationStatus:
                    tournament.registrationStatus ??
                    this.draft().registrationStatus ??
                    'not_open',
                registrationOpenedAt:
                    tournament.registrationOpenedAt ??
                    this.draft().registrationOpenedAt,
            });
            this.store.bindTournament(
                tournament.id,
                tournament.lifecycleStatus ?? this.draft().lifecycleStatus,
            );

            if (this.store.structureLocked()) {
                this.store.setIssues([]);
                this.store.markSaved('Данные турнира обновлены');
                return;
            }

            const serverSnapshot = await firstValueFrom(
                this.api.loadBuilder(tournament.id),
            );
            for (const obsolete of serverSnapshot.stages.filter(
                (stage) =>
                    !this.draft().stages.some(
                        (item) =>
                            item.serverId === stage.id ||
                            item.key === stage.key,
                    ),
            )) {
                await firstValueFrom(
                    this.api.removeStage(tournament.id, obsolete.id),
                );
            }
            for (const stage of this.draft()
                .stages.slice()
                .sort((a, b) => a.order - b.order)) {
                const payload = this.compact({
                    key: stage.key,
                    name: stage.name,
                    type: stage.type,
                    order: stage.order,
                    startDate: stage.startDate,
                    endDate: stage.endDate,
                    configuration: stageConfiguration(stage),
                });
                stage.serverId ??= serverSnapshot.stages.find(
                    (item) => item.key === stage.key,
                )?.id;
                const storedStage = serverSnapshot.stages.find(
                    (s) => s.id === stage.serverId,
                );
                const savedStage =
                    stage.serverId &&
                    storedStage &&
                    this.payloadMatches(payload, storedStage)
                        ? storedStage
                        : stage.serverId
                          ? await firstValueFrom(
                                this.api.updateStage(
                                    tournament.id,
                                    stage.serverId,
                                    payload,
                                ),
                            )
                          : await firstValueFrom(
                                this.api.createStage(tournament.id, payload),
                            );
                this.store.mutate((current) => {
                    const target = current.stages.find(
                        (item) => item.clientKey === stage.clientKey,
                    );
                    if (target) target.serverId = savedStage.id;
                });

                const serverStage = serverSnapshot.stages.find(
                    (item) => item.id === savedStage.id,
                );
                for (const obsolete of (serverStage?.groups ?? []).filter(
                    (group) =>
                        !stage.groups.some(
                            (item) =>
                                item.serverId === group.id ||
                                item.key === group.key,
                        ),
                )) {
                    await firstValueFrom(
                        this.api.removeGroup(
                            tournament.id,
                            savedStage.id,
                            obsolete.id,
                        ),
                    );
                }
                for (const group of stage.groups) {
                    group.serverId ??= serverStage?.groups.find(
                        (item) => item.key === group.key,
                    )?.id;
                    const groupPayload = this.compact({
                        key: group.key,
                        name: group.name,
                        order: group.order,
                        capacity: group.capacity,
                    });
                    const storedGroup = serverStage?.groups.find(
                        (g) => g.id === group.serverId,
                    );
                    const savedGroup =
                        group.serverId &&
                        storedGroup &&
                        this.payloadMatches(groupPayload, storedGroup)
                            ? storedGroup
                            : group.serverId
                              ? await firstValueFrom(
                                    this.api.updateGroup(
                                        tournament.id,
                                        savedStage.id,
                                        group.serverId,
                                        groupPayload,
                                    ),
                                )
                              : await firstValueFrom(
                                    this.api.createGroup(
                                        tournament.id,
                                        savedStage.id,
                                        groupPayload,
                                    ),
                                );
                    this.store.mutate((current) => {
                        const targetStage = current.stages.find(
                            (item) => item.clientKey === stage.clientKey,
                        );
                        const targetGroup = targetStage?.groups.find(
                            (item) => item.clientKey === group.clientKey,
                        );
                        if (targetGroup) targetGroup.serverId = savedGroup.id;
                    });
                }
            }

            await this.ensureTournamentTeams(tournament.id);
            await this.saveStageParticipants(tournament.id);

            const config = buildTournamentRules(this.draft());
            const rule = this.draft().ruleVersionId
                ? await firstValueFrom(
                      this.api.updateRuleVersion(
                          tournament.id,
                          this.draft().ruleVersionId!,
                          config,
                          this.draft().changeSummary || undefined,
                      ),
                  )
                : await firstValueFrom(
                      this.api.createRuleVersion(
                          tournament.id,
                          config,
                          this.draft().changeSummary || undefined,
                      ),
                  );
            this.store.patch({ ruleVersionId: rule.id });
            this.store.setIssues([]);
            this.store.markSaved(
                creating
                    ? 'Турнир создан без команд. Следующий шаг — открыть приём заявок.'
                    : 'Настройки турнира сохранены',
            );
            if (creating)
                await this.router.navigate(
                    ['/dashboard/tournaments', tournament.id, 'edit'],
                    { replaceUrl: true },
                );
        } catch (error) {
            this.applyBackendError(error);
            if (creating && this.draft().tournamentId)
                this.store.notice.set(
                    `Турнир №${this.draft().tournamentId} уже создан, но настройки сохранены не полностью. Исправьте ошибку и повторите сохранение — новый турнир создавать не нужно.`,
                );
        } finally {
            this.operation.set(null);
            this.store.saving.set(false);
        }
    }

    async validateTournament(
        mode: 'configuration' | 'launch' = 'configuration',
    ): Promise<void> {
        if (this.operation()) return;
        const localIssues = this.localValidation();
        this.store.setIssues(localIssues);
        if (!this.draft().tournamentId) {
            this.store.notice.set(
                'Сначала сохраните черновик, затем запустите серверную проверку',
            );
            return;
        }
        this.operation.set('validate');
        try {
            const result = await firstValueFrom(
                this.api.validate(
                    this.draft().tournamentId!,
                    buildTournamentRules(this.draft()),
                    mode,
                ),
            );
            this.store.setIssues(result.errors ?? []);
            this.store.notice.set(
                result.valid
                    ? mode === 'configuration'
                        ? 'Структура и правила корректны. Команды для создания турнира не нужны.'
                        : 'Строгая проверка пройдена: турнир готов к запуску'
                    : 'Найдены настройки, которые нужно исправить',
            );
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    async publishTournament(): Promise<void> {
        if (this.operation()) return;
        await this.saveDraft();
        if (this.store.dirty()) return;
        if (!this.draft().tournamentId || !this.draft().ruleVersionId) {
            this.store.notice.set(
                'Перед запуском сохраните настройки турнира и версию правил',
            );
            return;
        }
        await this.validateTournament('launch');
        if (this.store.validationIssues().length > 0) return;
        this.operation.set('publish');
        try {
            const result = await firstValueFrom(
                this.api.publish(
                    this.draft().tournamentId!,
                    this.draft().ruleVersionId!,
                ),
            );
            this.store.patch({
                lifecycleStatus: result.lifecycleStatus ?? 'published',
            });
            this.store.markSaved(
                'Турнир запущен. Подготовленные матчи доступны в публичном календаре.',
            );
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    async requestSchedulePreview(): Promise<void> {
        this.refreshLocalPreviews();
        const stage = this.groupStage();
        const tournamentId = this.draft().tournamentId;
        if (!tournamentId || !stage?.serverId) return;
        try {
            const backend = await firstValueFrom(
                this.api.previewSchedule(
                    tournamentId,
                    stage.serverId,
                    stage.legs,
                ),
            );
            this.store.setPreview({ backend });
        } catch (error) {
            this.applyBackendError(error, false);
        }
    }

    updateScoring(
        key: keyof TournamentBuilderDraft['scoring'],
        value: number,
    ): void {
        this.store.mutate((draft) => (draft.scoring[key] = Number(value)));
    }

    updateQualification(
        key: keyof TournamentBuilderDraft['qualification'],
        value: unknown,
    ): void {
        this.store.mutate((draft) => {
            (draft.qualification as unknown as Record<string, unknown>)[key] =
                value;
        });
        this.refreshLocalPreviews();
    }

    updatePlayoff(
        key: keyof TournamentBuilderDraft['playoff'],
        value: unknown,
    ): void {
        if (this.store.structureLocked()) return;
        this.store.mutate((draft) => {
            (draft.playoff as unknown as Record<string, unknown>)[key] = value;
            if (key === 'bracketSize') {
                for (const stage of draft.stages.filter(
                    (stage) => stage.type === 'knockout',
                )) {
                    stage.bracketSize = draft.playoff.bracketSize;
                }
                if (draft.playoff.bracketSize < 8)
                    draft.playoff.semiFinalPairing = 'adjacent';
            }
            if (key === 'thirdPlaceMatch') {
                for (const stage of draft.stages.filter(
                    (stage) => stage.type === 'knockout',
                )) {
                    stage.thirdPlaceMatch = draft.playoff.thirdPlaceMatch;
                }
            }
        });
        this.refreshLocalPreviews();
    }

    updateMatchRules(
        target: 'groupMatchRules' | 'playoffMatchRules',
        key: keyof TournamentBuilderDraft['groupMatchRules'],
        value: number | boolean | null,
    ): void {
        this.store.mutate((draft) => {
            (draft[target] as unknown as Record<string, unknown>)[key] = value;
        });
    }

    updateDiscipline(
        key: keyof TournamentBuilderDraft['discipline'],
        value: unknown,
    ): void {
        this.store.mutate((draft) => {
            (draft.discipline as unknown as Record<string, unknown>)[key] =
                value;
        });
    }

    readonly rulesJson = computed(() =>
        JSON.stringify(buildTournamentRules(this.draft()), null, 2),
    );

    private loadTeams(): void {
        this.teamsLoading.set(true);
        this.teamsApi.getTeams().subscribe({
            next: (teams) => {
                this.teams.set(teams.filter((team) => team.isActive));
                this.teamsLoading.set(false);
            },
            error: () => {
                this.teamsLoading.set(false);
                this.store.notice.set(
                    'Не удалось загрузить каталог команд. Уже выбранные команды доступны.',
                );
            },
        });
    }

    private async loadServerDraft(tournamentId: number): Promise<void> {
        this.operation.set('save');
        try {
            const snapshot = await firstValueFrom(
                this.api.loadBuilder(tournamentId),
            );
            this.store.replace(this.fromSnapshot(snapshot));
            if (this.workflowPhase() !== 'setup')
                this.goToStep(this.workflowPhase() === 'preparation' ? 3 : 9);
            const season = this.availableSeasons().find(
                (s) => s.id === snapshot.tournament.seasonId,
            );
            if (season) this.selectedCommunityId.set(season.communityId);
            this.store.markSaved('Черновик турнира загружен');
            this.refreshLocalPreviews();
            await this.loadPreparationCalendar();
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    private async ensureTournamentTeams(tournamentId: number): Promise<void> {
        if (this.draft().registrationRequired) {
            await this.refreshAcceptedTeams(tournamentId);
            return;
        }
        for (const participant of this.draft().participants) {
            if (participant.tournamentTeamId) continue;
            const saved = await firstValueFrom(
                this.api.ensureTournamentTeam(tournamentId, participant.teamId),
            );
            this.store.mutate((draft) => {
                const target = draft.participants.find(
                    (item) => item.teamId === participant.teamId,
                );
                if (target) target.tournamentTeamId = saved.id;
            });
        }
    }

    private async refreshAcceptedTeams(tournamentId: number): Promise<void> {
        try {
            const snapshot = await firstValueFrom(
                this.api.loadBuilder(tournamentId),
            );
            if (snapshot.tournament.registrationRequired)
                this.store.mutate((draft) => {
                    draft.registrationRequired = true;
                    draft.registrationStatus =
                        snapshot.tournament.registrationStatus;
                    draft.registrationOpenedAt =
                        snapshot.tournament.registrationOpenedAt;
                    for (const accepted of snapshot.tournamentTeams) {
                        if (
                            !draft.participants.some(
                                (p) => p.teamId === accepted.teamId,
                            )
                        )
                            draft.participants.push({
                                teamId: accepted.teamId,
                                tournamentTeamId: accepted.id,
                                name:
                                    accepted.team?.name ??
                                    `Команда ${accepted.teamId}`,
                                shortName: accepted.team?.shortName,
                                logoUrl: accepted.team?.logoUrl,
                            });
                    }
                    draft.participants = draft.participants.filter((p) =>
                        snapshot.tournamentTeams.some(
                            (t) => t.teamId === p.teamId,
                        ),
                    );
                });
            await this.loadPreparationCalendar();
        } catch (error) {
            this.applyBackendError(error);
            throw error;
        }
    }

    private async saveStageParticipants(tournamentId: number): Promise<void> {
        const stage = this.groupStage() ?? this.draft().stages[0];
        if (!stage?.serverId) return;
        const snapshot = await firstValueFrom(
            this.api.loadBuilder(tournamentId),
        );
        const serverStage = snapshot.stages.find(
            (s) => s.id === stage.serverId,
        );
        for (const participantId of this.draft().removedStageParticipantIds) {
            await firstValueFrom(
                this.api.removeStageParticipant(
                    tournamentId,
                    stage.serverId,
                    participantId,
                ),
            );
        }
        this.store.patch({ removedStageParticipantIds: [] });
        for (const participant of this.draft().participants) {
            if (!participant.tournamentTeamId) continue;
            participant.stageParticipantId ??= serverStage?.participants.find(
                (p) => p.tournamentTeamId === participant.tournamentTeamId,
            )?.id;
            const groupId = stage.groups.find(
                (group) => group.key === participant.groupKey,
            )?.serverId;
            const payload = this.compact({
                tournamentTeamId: participant.tournamentTeamId,
                groupId: groupId ?? null,
                seedNumber: participant.seedNumber,
            });
            const storedParticipant = serverStage?.participants.find(
                (p) => p.id === participant.stageParticipantId,
            );
            if (
                storedParticipant &&
                this.payloadMatches(payload, {
                    ...storedParticipant,
                    groupId: storedParticipant.groupId ?? null,
                })
            )
                continue;
            const saved = participant.stageParticipantId
                ? await firstValueFrom(
                      this.api.updateStageParticipant(
                          tournamentId,
                          stage.serverId,
                          participant.stageParticipantId,
                          payload,
                      ),
                  )
                : await firstValueFrom(
                      this.api.addStageParticipant(
                          tournamentId,
                          stage.serverId,
                          payload,
                      ),
                  );
            this.store.mutate((draft) => {
                const target = draft.participants.find(
                    (item) => item.teamId === participant.teamId,
                );
                if (target) target.stageParticipantId = saved.id;
            });
        }
    }

    private fromSnapshot(
        snapshot: TournamentBuilderSnapshot,
    ): TournamentBuilderDraft {
        const tournament = snapshot.tournament;
        const hasGroups = snapshot.stages.some(
            (stage) => stage.type === 'group_stage',
        );
        const hasKnockout = snapshot.stages.some(
            (stage) => stage.type === 'knockout',
        );
        const template =
            hasGroups && hasKnockout
                ? 'groups_playoff'
                : hasKnockout
                  ? 'knockout'
                  : 'round_robin';
        const draft = createTournamentTemplate(template);
        draft.tournamentId = tournament.id;
        draft.lifecycleStatus = tournament.lifecycleStatus ?? 'draft';
        draft.details = {
            seasonId: tournament.seasonId,
            name: tournament.name,
            slug: tournament.slug,
            description: tournament.description ?? '',
            type: tournament.type ?? 'league',
            format: tournament.format ?? 'round_robin',
            startDate: tournament.startDate ?? '',
            endDate: tournament.endDate ?? '',
            colorPrimary: tournament.colorPrimary ?? '#72DF9C',
            colorSecondary: tournament.colorSecondary ?? '#FFD91A',
            logoUrl: tournament.logoUrl ?? '',
        };
        draft.stages = snapshot.stages.map((stage) => ({
            clientKey: `server-stage-${stage.id}`,
            serverId: stage.id,
            key: stage.key,
            name: stage.name,
            type: stage.type,
            order: stage.order,
            startDate: stage.startDate ?? '',
            endDate: stage.endDate ?? '',
            legs: this.asLegs(stage.configuration?.['legs']),
            groups: stage.groups.map((group) => ({
                clientKey: `server-group-${group.id}`,
                serverId: group.id,
                key: group.key,
                name: group.name,
                order: group.order,
                capacity: group.capacity,
            })),
            ...(stage.type === 'knockout'
                ? {
                      bracketSize: this.asBracketSize(
                          stage.configuration?.['bracketSize'],
                      ),
                      thirdPlaceMatch: Boolean(
                          stage.configuration?.['thirdPlaceMatch'],
                      ),
                  }
                : {}),
        }));

        const sourceStage =
            snapshot.stages.find((stage) => stage.type === 'group_stage') ??
            snapshot.stages[0];
        draft.participants = (sourceStage?.participants ?? []).map(
            (participant) => {
                const team = participant.tournamentTeam.team;
                const group = sourceStage.groups.find(
                    (item) => item.id === participant.groupId,
                );
                return {
                    teamId: participant.tournamentTeam.teamId,
                    tournamentTeamId: participant.tournamentTeamId,
                    stageParticipantId: participant.id,
                    name:
                        team?.name ??
                        `Команда ${participant.tournamentTeam.teamId}`,
                    shortName: team?.shortName,
                    logoUrl: team?.logoUrl,
                    groupKey: group?.key,
                    seedNumber: participant.seedNumber,
                };
            },
        );

        const ruleVersion =
            snapshot.ruleVersions.find(
                (version) => version.status === 'draft',
            ) ??
            snapshot.ruleVersions.find(
                (version) => version.id === tournament.activeRuleVersionId,
            ) ??
            snapshot.ruleVersions[0];
        draft.ruleVersionId =
            ruleVersion?.status === 'draft' ? ruleVersion.id : undefined;
        if (ruleVersion?.config) {
            this.applyConfig(draft, ruleVersion.config);
        }
        draft.registrationRequired = tournament.registrationRequired;
        draft.registrationStatus = tournament.registrationStatus;
        draft.registrationOpenedAt = tournament.registrationOpenedAt;
        if (tournament.registrationRequired)
            for (const accepted of snapshot.tournamentTeams) {
                if (
                    !draft.participants.some(
                        (p) => p.teamId === accepted.teamId,
                    )
                )
                    draft.participants.push({
                        teamId: accepted.teamId,
                        tournamentTeamId: accepted.id,
                        name:
                            accepted.team?.name ?? `Команда ${accepted.teamId}`,
                        shortName: accepted.team?.shortName,
                        logoUrl: accepted.team?.logoUrl,
                    });
            }
        draft.removedStageParticipantIds = [];
        return draft;
    }

    private applyConfig(
        draft: TournamentBuilderDraft,
        config: {
            stages: Array<Record<string, unknown>>;
            transitions: Array<Record<string, unknown>>;
        },
    ): void {
        const tableStage = config.stages.find(
            (stage) => stage['type'] !== 'knockout',
        );
        const knockout = config.stages.find(
            (stage) => stage['type'] === 'knockout',
        );
        const scoring = tableStage?.['scoring'] as
            | Record<string, number>
            | undefined;
        if (scoring) draft.scoring = { ...draft.scoring, ...scoring };

        const standings = tableStage?.['standings'] as
            | {
                  tieBreakers?: Array<{
                      type?: TieBreakerType | 'draw_lots';
                  }>;
              }
            | undefined;
        if (standings?.tieBreakers?.length) {
            draft.tieBreakers = standings.tieBreakers
                .map((item) => (item.type === 'draw_lots' ? 'draw' : item.type))
                .filter((item): item is TieBreakerType => Boolean(item));
        }

        const qualification = config.transitions[0]?.['qualification'] as
            | Array<Record<string, unknown>>
            | undefined;
        if (qualification?.length) {
            draft.qualification.enabled = true;
            const top = qualification.find(
                (rule) =>
                    rule['type'] === 'group_winners' ||
                    rule['type'] === 'top_n_per_group',
            );
            draft.qualification.winnersPerGroup =
                top?.['type'] === 'top_n_per_group'
                    ? ((top['positions'] as unknown[])?.length ?? 1)
                    : 1;
            const best = qualification.find(
                (rule) => rule['type'] === 'best_placed_teams_between_groups',
            );
            if (best) {
                draft.qualification.bestPlacedSourcePosition = Number(
                    best['sourcePosition'] ?? 2,
                );
                draft.qualification.bestPlacedCount = Number(
                    best['count'] ?? 0,
                );
                const ranking = best['ranking'] as
                    | {
                          criteria?: TournamentBuilderDraft['qualification']['crossGroupCriteria'];
                      }
                    | undefined;
                if (ranking?.criteria) {
                    draft.qualification.crossGroupCriteria = ranking.criteria;
                }
            }
        }

        if (knockout) {
            draft.playoff.enabled = true;
            const bracket = knockout['bracket'] as
                | Record<string, unknown>
                | undefined;
            const seeding = bracket?.['seeding'] as
                | Record<string, unknown>
                | undefined;
            draft.playoff.bracketSize = this.asBracketSize(bracket?.['size']);
            draft.playoff.quarterFinalLegs =
                bracket?.['quarterFinalLegs'] === 2 ? 2 : 1;
            draft.playoff.semiFinalLegs =
                bracket?.['semiFinalLegs'] === 2 ? 2 : 1;
            draft.playoff.semiFinalPairing =
                bracket?.['semiFinalPairing'] === 'cross'
                    ? 'cross'
                    : 'adjacent';
            draft.playoff.thirdPlaceMatch =
                bracket?.['placementMatch'] === 'third_place';
            const seedingType = seeding?.['type'];
            if (
                seedingType === 'standard' ||
                seedingType === 'random_draw' ||
                seedingType === 'manual' ||
                seedingType === 'best_eligible_opponent'
            ) {
                draft.playoff.seeding = seedingType;
            }
            const constraints = seeding?.['constraints'] as
                | Array<Record<string, unknown>>
                | undefined;
            const avoid = constraints?.find(
                (item) => item['type'] === 'avoid_same_source_group',
            );
            draft.playoff.avoidSameSourceGroup = Boolean(avoid);
            if (
                avoid?.['mode'] === 'required' ||
                avoid?.['mode'] === 'best_effort'
            ) {
                draft.playoff.constraintMode = avoid['mode'];
            }
        }

        this.applyMatchAndDiscipline(draft, tableStage, 'groupMatchRules');
        this.applyMatchAndDiscipline(draft, knockout, 'playoffMatchRules');
    }

    private applyMatchAndDiscipline(
        draft: TournamentBuilderDraft,
        stage: Record<string, unknown> | undefined,
        target: 'groupMatchRules' | 'playoffMatchRules',
    ): void {
        if (!stage) return;
        const match = stage['match'] as Record<string, unknown> | undefined;
        const extraTime = match?.['extraTime'] as
            | Record<string, unknown>
            | undefined;
        const penalties = match?.['penalties'] as
            | Record<string, unknown>
            | undefined;
        if (match) {
            draft[target] = {
                ...draft[target],
                periods: Number(match['periods'] ?? draft[target].periods),
                periodDurationMinutes:
                    match['periodDurationMinutes'] == null
                        ? null
                        : Number(match['periodDurationMinutes']),
                allowDraw: Boolean(match['allowDraw']),
                extraTimeEnabled: Boolean(extraTime?.['enabled']),
                extraTimePeriods: Number(
                    extraTime?.['periods'] ?? draft[target].extraTimePeriods,
                ),
                extraTimePeriodDurationMinutes: Number(
                    extraTime?.['periodDurationMinutes'] ??
                        draft[target].extraTimePeriodDurationMinutes,
                ),
                penaltiesEnabled: Boolean(penalties?.['enabled']),
                initialKicksPerTeam: Number(
                    penalties?.['initialKicksPerTeam'] ??
                        draft[target].initialKicksPerTeam,
                ),
                suddenDeath: true,
            };
        }

        const discipline = stage['discipline'] as
            | Record<string, Record<string, unknown>>
            | undefined;
        if (!discipline) return;
        const yellows = discipline['accumulatedYellows'];
        const secondYellow = discipline['secondYellowInMatch'];
        const directRed = discipline['directRed'];
        const transition = discipline['stageTransition'];
        draft.discipline = {
            ...draft.discipline,
            accumulatedYellowsEnabled: Boolean(yellows?.['enabled']),
            yellowThreshold: Number(
                yellows?.['threshold'] ?? draft.discipline.yellowThreshold,
            ),
            suspensionMatches: Number(
                yellows?.['suspensionMatches'] ??
                    draft.discipline.suspensionMatches,
            ),
            yellowProgression:
                (yellows?.[
                    'progression'
                ] as TournamentBuilderDraft['discipline']['yellowProgression']) ??
                draft.discipline.yellowProgression,
            secondYellowEnabled: Boolean(secondYellow?.['enabled']),
            secondYellowMinimumMatches: Number(
                secondYellow?.['minimumMatches'] ??
                    draft.discipline.secondYellowMinimumMatches,
            ),
            directRedEnabled: Boolean(directRed?.['enabled']),
            directRedMinimumMatches: Number(
                directRed?.['minimumMatches'] ??
                    draft.discipline.directRedMinimumMatches,
            ),
            allowManualExtension: Boolean(
                secondYellow?.['allowManualExtension'] ??
                    directRed?.['allowManualExtension'],
            ),
            carryYellowCards: Boolean(transition?.['carryYellowCards']),
            carryPendingSuspensions: Boolean(
                transition?.['carryPendingSuspensions'],
            ),
        };
    }

    private asLegs(value: unknown): 1 | 2 | 3 | 4 {
        return value === 2 || value === 3 || value === 4 ? value : 1;
    }

    private asBracketSize(value: unknown): 2 | 4 | 8 | 16 | 32 {
        return value === 2 || value === 8 || value === 16 || value === 32
            ? value
            : 4;
    }

    private refreshLocalPreviews(): void {
        const schedule = this.buildSchedulePreview();
        const groupStage = this.groupStage();
        const qualification = groupStage
            ? [
                  `${this.draft().qualification.winnersPerGroup === 1 ? 'Победители' : `Первые ${this.draft().qualification.winnersPerGroup}`} каждой из ${groupStage.groups.length} групп`,
                  ...(this.draft().qualification.bestPlacedCount
                      ? [
                            `${this.draft().qualification.bestPlacedCount} лучших среди мест №${this.draft().qualification.bestPlacedSourcePosition}: ${this.draft().qualification.crossGroupCriteria.join(' → ')}`,
                        ]
                      : []),
              ]
            : [];
        const size = this.draft().playoff.bracketSize;
        const bracket: Array<{ position: string; home: string; away: string }> =
            [];
        let previous: string[] = [];
        for (let entrants: number = size; entrants >= 2; entrants /= 2) {
            const prefix =
                entrants === 2
                    ? 'FINAL'
                    : entrants === 4
                      ? 'SF'
                      : entrants === 8
                        ? 'QF'
                        : `R${entrants}`;
            if (
                entrants === 2 &&
                previous.length === 2 &&
                this.draft().playoff.thirdPlaceMatch
            ) {
                bracket.push({
                    position: 'THIRD_PLACE',
                    home: `Проигравший ${previous[0]}`,
                    away: `Проигравший ${previous[1]}`,
                });
            }
            const positions: string[] = [];
            for (let i = 0; i < entrants / 2; i++) {
                const position =
                    entrants === 2 ? 'FINAL' : `${prefix}-${i + 1}`;
                positions.push(position);
                const cross =
                    entrants === 4 &&
                    this.draft().playoff.semiFinalPairing === 'cross';
                const home = previous.length
                    ? `Победитель ${previous[cross ? i : i * 2]}`
                    : `Посев ${i + 1}`;
                const away = previous.length
                    ? `Победитель ${previous[cross ? i + 2 : i * 2 + 1]}`
                    : `Посев ${entrants - i}`;
                const legs =
                    entrants === 8
                        ? (this.draft().playoff.quarterFinalLegs ?? 1)
                        : entrants === 4
                          ? (this.draft().playoff.semiFinalLegs ?? 1)
                          : 1;
                for (let leg = 1; leg <= legs; leg++) {
                    bracket.push({
                        position: `${position}${legs === 2 ? `:L${leg}` : ''}`,
                        home: leg === 2 ? away : home,
                        away: leg === 2 ? home : away,
                    });
                }
            }
            previous = positions;
        }
        this.store.setPreview({ schedule, qualification, bracket });
    }

    private buildSchedulePreview() {
        const stage = this.groupStage();
        if (!stage) return [];
        const matches: Array<{
            round: number;
            groupKey: string;
            home: string;
            away: string;
        }> = [];
        for (const group of stage.groups) {
            const selected = this.participantsForGroup(group.key).map(
                (participant) => participant.name,
            );
            const teams =
                selected.length > 1
                    ? selected
                    : Array.from(
                          { length: group.capacity ?? 0 },
                          (_, index) => `Команда ${group.key}${index + 1}`,
                      );
            const rotating: Array<string | null> = teams.slice();
            if (rotating.length % 2 === 1) rotating.push(null);
            if (rotating.length < 2) continue;
            const rounds = rotating.length - 1;
            for (let leg = 0; leg < stage.legs; leg += 1) {
                const current = rotating.slice();
                for (let round = 0; round < rounds; round += 1) {
                    for (let pair = 0; pair < current.length / 2; pair += 1) {
                        const left = current[pair];
                        const right = current[current.length - 1 - pair];
                        if (!left || !right) continue;
                        const reverse = (round + leg) % 2 === 1;
                        matches.push({
                            round: leg * rounds + round + 1,
                            groupKey: group.key,
                            home: reverse ? right : left,
                            away: reverse ? left : right,
                        });
                    }
                    current.splice(1, 0, current.pop()!);
                }
            }
        }
        return matches;
    }

    private localValidation(): TournamentValidationIssue[] {
        const draft = this.draft();
        const issues: TournamentValidationIssue[] = [];
        if (!draft.details.name.trim()) {
            issues.push({
                path: '$.name',
                message: 'Укажите название турнира',
                code: 'required',
            });
        }
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.details.slug)) {
            issues.push({
                path: '$.slug',
                message:
                    'Slug должен содержать латинские буквы, цифры и дефисы',
                code: 'required',
            });
        }
        if (!draft.details.seasonId) {
            issues.push({
                path: '$.seasonId',
                message: 'Укажите сезон',
                code: 'required',
            });
        }
        if (!draft.stages.length) {
            issues.push({
                path: '$.stages',
                message: 'Добавьте хотя бы один этап',
                code: 'required',
            });
        }
        const duplicateKeys = draft.stages.filter(
            (stage, index) =>
                draft.stages.findIndex((item) => item.key === stage.key) !==
                index,
        );
        if (duplicateKeys.length) {
            issues.push({
                path: '$.stages',
                message: 'Ключи этапов должны быть уникальными',
            });
        }
        const groupStage = this.groupStage();
        if (groupStage) {
            const unassigned = draft.participants.filter(
                (participant) => !participant.groupKey,
            );
            if (unassigned.length && this.workflowPhase() !== 'setup') {
                issues.push({
                    path: '$.participants.groups',
                    message: `${unassigned.length} команд не распределены по группам`,
                });
            }
            for (const group of groupStage.groups) {
                const count = this.participantsForGroup(group.key).length;
                if (group.capacity && count > group.capacity) {
                    issues.push({
                        path: `$.stages[${groupStage.order - 1}].groups.${group.key}`,
                        message: `${group.name}: превышена вместимость`,
                    });
                }
            }
        }
        if (
            draft.playoff.enabled &&
            draft.qualification.enabled &&
            groupStage
        ) {
            const qualified =
                groupStage.groups.length * draft.qualification.winnersPerGroup +
                draft.qualification.bestPlacedCount;
            if (qualified !== draft.playoff.bracketSize) {
                issues.push({
                    path: '$.transitions[0].qualification',
                    message: `Квалификация даёт ${qualified} команд, а сетка рассчитана на ${draft.playoff.bracketSize}`,
                });
            }
        }
        if (draft.playoff.enabled && draft.playoffMatchRules.allowDraw) {
            issues.push({
                path: '$.stages.playoff.match.allowDraw',
                message: 'В матче плей-офф должен определяться победитель',
            });
        }
        if (
            draft.playoff.enabled &&
            !draft.playoffMatchRules.allowDraw &&
            !draft.playoffMatchRules.extraTimeEnabled &&
            !draft.playoffMatchRules.penaltiesEnabled
        ) {
            issues.push({
                path: '$.stages.playoff.match',
                message: 'Включите дополнительное время или серию пенальти',
            });
        }
        return issues;
    }

    private applyBackendError(error: unknown, replace = true): void {
        const body = (error as { error?: unknown })?.error as
            | Record<string, unknown>
            | undefined;
        const validation =
            (body?.['errors'] as TournamentValidationIssue[] | undefined) ??
            ((body?.['message'] as Record<string, unknown> | undefined)?.[
                'errors'
            ] as TournamentValidationIssue[] | undefined);
        let issues = Array.isArray(validation) ? validation : [];
        if (!issues.length) {
            const message = body?.['message'];
            const messages = Array.isArray(message)
                ? message.map(String)
                : [String(message ?? 'Не удалось выполнить операцию')];
            issues = messages.map((item) => ({
                path: '$',
                message: item,
            }));
        }
        if (replace) this.store.setIssues(issues);
        this.store.notice.set(issues[0]?.message ?? 'Ошибка сервера');
    }

    private createGroups(stageKey: string, count: number, capacity: number) {
        return Array.from({ length: count }, (_, index) => ({
            clientKey: `${stageKey}-group-${index + 1}-${crypto.randomUUID()}`,
            key: String.fromCharCode(65 + index),
            name: `Группа ${String.fromCharCode(65 + index)}`,
            order: index + 1,
            capacity,
        }));
    }

    private compact(value: Record<string, unknown>): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(value).filter(
                ([, item]) => item !== '' && item !== undefined,
            ),
        );
    }

    private payloadMatches(
        payload: Record<string, unknown>,
        stored: object,
    ): boolean {
        const normalize = (value: unknown): unknown =>
            Array.isArray(value)
                ? value.map(normalize)
                : value && typeof value === 'object'
                  ? Object.fromEntries(
                        Object.entries(value)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([key, v]) => [key, normalize(v)]),
                    )
                  : value;
        return Object.entries(payload).every(
            ([key, value]) =>
                JSON.stringify(normalize(value)) ===
                JSON.stringify(
                    normalize((stored as Record<string, unknown>)[key]),
                ),
        );
    }

    private slugify(value: string): string {
        const transliteration: Record<string, string> = {
            а: 'a',
            б: 'b',
            в: 'v',
            г: 'g',
            д: 'd',
            е: 'e',
            ё: 'e',
            ж: 'zh',
            з: 'z',
            и: 'i',
            й: 'y',
            к: 'k',
            л: 'l',
            м: 'm',
            н: 'n',
            о: 'o',
            п: 'p',
            р: 'r',
            с: 's',
            т: 't',
            у: 'u',
            ф: 'f',
            х: 'h',
            ц: 'c',
            ч: 'ch',
            ш: 'sh',
            щ: 'sch',
            ъ: '',
            ы: 'y',
            ь: '',
            э: 'e',
            ю: 'yu',
            я: 'ya',
        };
        return value
            .toLowerCase()
            .split('')
            .map((char) => transliteration[char] ?? char)
            .join('')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
}
