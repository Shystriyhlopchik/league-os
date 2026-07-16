import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

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

    readonly templates = TOURNAMENT_TEMPLATES;
    readonly steps: TournamentWizardStep[] = [
        { shortTitle: 'Основное', title: 'Основная информация' },
        { shortTitle: 'Этапы', title: 'Формат и этапы' },
        { shortTitle: 'Команды', title: 'Участники' },
        { shortTitle: 'Группы', title: 'Распределение по группам' },
        { shortTitle: 'Таблица', title: 'Очки и тай-брейки' },
        { shortTitle: 'Отбор', title: 'Правила квалификации' },
        { shortTitle: 'Плей-офф', title: 'Формат и посев' },
        { shortTitle: 'Матч', title: 'Определение победителя' },
        { shortTitle: 'Карточки', title: 'Дисциплина' },
        { shortTitle: 'Проверка', title: 'Проверка и публикация' },
    ];
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
    readonly operation = signal<'save' | 'validate' | 'publish' | null>(null);
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
        this.savedDrafts.set(this.store.listSavedDrafts());
        this.loadTeams();
        this.refreshLocalPreviews();
        if (tournamentId && !restored) {
            void this.loadServerDraft(Number(tournamentId));
        }
    }

    goToStep(step: number): void {
        this.store.patch({
            currentStep: Math.max(0, Math.min(this.steps.length - 1, step)),
        });
    }

    next(): void {
        this.goToStep(this.activeStep() + 1);
    }

    previous(): void {
        this.goToStep(this.activeStep() - 1);
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
            stage.groups = this.createGroups(stage.key, safeCount, capacity);
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

    setTeamsPerGroup(stageKey: string, capacity: number): void {
        const safeCapacity = Math.max(2, Math.min(32, Number(capacity) || 2));
        this.store.mutate((draft) => {
            draft.stages
                .find((item) => item.clientKey === stageKey)
                ?.groups.forEach((group) => (group.capacity = safeCapacity));
        });
        this.refreshLocalPreviews();
    }

    toggleTeam(team: Team): void {
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

    groupCapacity(stage: TournamentStageDraft): number {
        return stage.groups[0]?.capacity ?? 4;
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
                    (hint) =>
                        issue.path === hint || issue.path.includes(hint),
                ),
            ).length;
    }

    async saveDraft(): Promise<void> {
        if (this.operation()) return;
        this.operation.set('save');
        this.store.saving.set(true);
        this.store.notice.set(null);
        this.store.setIssues(this.localValidation());
        if (this.store.validationIssues().some((issue) => issue.code === 'required')) {
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

            this.store.bindTournament(
                tournament.id,
                tournament.lifecycleStatus ?? this.draft().lifecycleStatus,
            );

            if (this.store.structureLocked()) {
                this.store.setIssues([]);
                this.store.markSaved('Данные турнира обновлены');
                return;
            }

            for (const stage of this.draft().stages
                .slice()
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
                const savedStage = stage.serverId
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

                for (const group of stage.groups) {
                    const groupPayload = this.compact({
                        key: group.key,
                        name: group.name,
                        order: group.order,
                        capacity: group.capacity,
                    });
                    const savedGroup = group.serverId
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
            this.store.markSaved();
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
            this.store.saving.set(false);
        }
    }

    async validateTournament(): Promise<void> {
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
                ),
            );
            this.store.setIssues(result.errors ?? []);
            this.store.notice.set(
                result.valid
                    ? 'Проверка пройдена: турнир готов к публикации'
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
        if (!this.draft().tournamentId || !this.draft().ruleVersionId) {
            this.store.notice.set(
                'Перед публикацией сохраните черновик и версию правил',
            );
            return;
        }
        await this.validateTournament();
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
            this.store.markSaved('Турнир опубликован');
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
        this.store.mutate(
            (draft) => (draft.scoring[key] = Number(value)),
        );
    }

    updateQualification(
        key: keyof TournamentBuilderDraft['qualification'],
        value: unknown,
    ): void {
        this.store.mutate((draft) => {
            (
                draft.qualification as unknown as Record<string, unknown>
            )[key] = value;
        });
        this.refreshLocalPreviews();
    }

    updatePlayoff(
        key: keyof TournamentBuilderDraft['playoff'],
        value: unknown,
    ): void {
        this.store.mutate((draft) => {
            (draft.playoff as unknown as Record<string, unknown>)[key] =
                value;
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
            this.store.markSaved('Черновик турнира загружен');
            this.refreshLocalPreviews();
        } catch (error) {
            this.applyBackendError(error);
        } finally {
            this.operation.set(null);
        }
    }

    private async ensureTournamentTeams(tournamentId: number): Promise<void> {
        for (const participant of this.draft().participants) {
            if (participant.tournamentTeamId) continue;
            const saved = await firstValueFrom(
                this.api.ensureTournamentTeam(
                    tournamentId,
                    participant.teamId,
                ),
            );
            this.store.mutate((draft) => {
                const target = draft.participants.find(
                    (item) => item.teamId === participant.teamId,
                );
                if (target) target.tournamentTeamId = saved.id;
            });
        }
    }

    private async saveStageParticipants(tournamentId: number): Promise<void> {
        const stage = this.groupStage() ?? this.draft().stages[0];
        if (!stage?.serverId) return;
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
            const groupId = stage.groups.find(
                (group) => group.key === participant.groupKey,
            )?.serverId;
            const payload = this.compact({
                tournamentTeamId: participant.tournamentTeamId,
                groupId,
                seedNumber: participant.seedNumber,
            });
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
        const template = hasGroups && hasKnockout
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
                .map((item) =>
                    item.type === 'draw_lots' ? 'draw' : item.type,
                )
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
                (rule) =>
                    rule['type'] ===
                    'best_placed_teams_between_groups',
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
                    draft.qualification.crossGroupCriteria =
                        ranking.criteria;
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
            draft.playoff.bracketSize = this.asBracketSize(
                bracket?.['size'],
            );
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

        this.applyMatchAndDiscipline(
            draft,
            tableStage,
            'groupMatchRules',
        );
        this.applyMatchAndDiscipline(
            draft,
            knockout,
            'playoffMatchRules',
        );
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
                    extraTime?.['periods'] ??
                        draft[target].extraTimePeriods,
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
        return value === 2 ||
            value === 8 ||
            value === 16 ||
            value === 32
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
        const bracket =
            size === 4
                ? [
                      {
                          position: 'SF-1',
                          home: 'Лучший доступный победитель группы',
                          away: 'Лучшая вторая команда',
                      },
                      {
                          position: 'SF-2',
                          home: 'Оставшийся победитель',
                          away: 'Оставшийся победитель',
                      },
                      ...(this.draft().playoff.thirdPlaceMatch
                          ? [
                                {
                                    position: 'THIRD_PLACE',
                                    home: 'Проигравший SF-1',
                                    away: 'Проигравший SF-2',
                                },
                            ]
                          : []),
                      {
                          position: 'FINAL',
                          home: 'Победитель SF-1',
                          away: 'Победитель SF-2',
                      },
                  ]
                : [
                      {
                          position: `ROUND-OF-${size}`,
                          home: 'Посев 1',
                          away: `Посев ${size}`,
                      },
                  ];
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
                    for (
                        let pair = 0;
                        pair < current.length / 2;
                        pair += 1
                    ) {
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
                message: 'Slug должен содержать латинские буквы, цифры и дефисы',
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
            if (unassigned.length) {
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
                groupStage.groups.length *
                    draft.qualification.winnersPerGroup +
                draft.qualification.bestPlacedCount;
            if (qualified !== draft.playoff.bracketSize) {
                issues.push({
                    path: '$.transitions[0].qualification',
                    message: `Квалификация даёт ${qualified} команд, а сетка рассчитана на ${draft.playoff.bracketSize}`,
                });
            }
        }
        if (
            draft.playoff.enabled &&
            draft.playoffMatchRules.allowDraw
        ) {
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
        let issues = Array.isArray(validation)
            ? validation
            : [];
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

    private slugify(value: string): string {
        const transliteration: Record<string, string> = {
            а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e',
            ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
            н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
            ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
            ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
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
