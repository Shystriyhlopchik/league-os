import { computed, Injectable, signal } from '@angular/core';

import { createTournamentTemplate } from './tournament-templates';
import {
    SavedTournamentDraftSummary,
    TournamentBuilderDraft,
    TournamentBuilderPreviews,
    TournamentValidationIssue,
} from './tournament-builder.types';

const STORAGE_PREFIX = 'league-os:tournament-builder:';

function clone<T>(value: T): T {
    return structuredClone(value);
}

@Injectable()
export class TournamentBuilderStore {
    private readonly state = signal<TournamentBuilderDraft>(
        createTournamentTemplate('groups_playoff'),
    );

    readonly draft = this.state.asReadonly();
    readonly saving = signal(false);
    readonly dirty = signal(false);
    readonly notice = signal<string | null>(null);
    readonly validationIssues = signal<TournamentValidationIssue[]>([]);
    readonly previews = signal<TournamentBuilderPreviews>({
        schedule: [],
        qualification: [],
        bracket: [],
    });

    readonly structureLocked = computed(
        () => this.state().lifecycleStatus !== 'draft',
    );
    readonly validationIssueMap = computed(() => {
        const result = new Map<string, string[]>();
        for (const issue of this.validationIssues()) {
            const existing = result.get(issue.path) ?? [];
            existing.push(issue.message);
            result.set(issue.path, existing);
        }
        return result;
    });

    initialize(storageIdentity?: string): boolean {
        const directKey = storageIdentity
            ? `${STORAGE_PREFIX}${storageIdentity}`
            : undefined;
        const raw = directKey ? localStorage.getItem(directKey) : null;
        if (raw) {
            try {
                const restored = JSON.parse(raw) as TournamentBuilderDraft;
                restored.removedStageParticipantIds ??= [];
                this.state.set(restored);
                return true;
            } catch {
                localStorage.removeItem(directKey!);
            }
        }
        const fresh = createTournamentTemplate('groups_playoff');
        if (storageIdentity && /^\d+$/.test(storageIdentity)) {
            fresh.tournamentId = Number(storageIdentity);
        }
        this.state.set(fresh);
        if (!storageIdentity || !/^\d+$/.test(storageIdentity)) {
            this.persist();
        }
        return false;
    }

    replace(draft: TournamentBuilderDraft): void {
        this.state.set(clone(draft));
        this.dirty.set(true);
        this.persist();
    }

    patch(patch: Partial<TournamentBuilderDraft>): void {
        this.state.update((current) => ({ ...current, ...clone(patch) }));
        this.dirty.set(true);
        this.persist();
    }

    mutate(mutator: (draft: TournamentBuilderDraft) => void): void {
        this.state.update((current) => {
            const next = clone(current);
            mutator(next);
            return next;
        });
        this.dirty.set(true);
        this.persist();
    }

    setIssues(issues: TournamentValidationIssue[]): void {
        this.validationIssues.set(issues);
    }

    setPreview(patch: Partial<TournamentBuilderPreviews>): void {
        this.previews.update((current) => ({ ...current, ...patch }));
    }

    bindTournament(
        tournamentId: number,
        lifecycleStatus: TournamentBuilderDraft['lifecycleStatus'],
    ): void {
        const current = this.state();
        const oldKey = `${STORAGE_PREFIX}${current.tournamentId ?? current.localId}`;
        this.state.set({
            ...current,
            tournamentId,
            lifecycleStatus,
        });
        const newKey = `${STORAGE_PREFIX}${tournamentId}`;
        if (oldKey !== newKey) localStorage.removeItem(oldKey);
        this.dirty.set(true);
        this.persist();
    }

    markSaved(message = 'Черновик сохранён'): void {
        this.state.update((current) => ({
            ...current,
            savedAt: new Date().toISOString(),
        }));
        this.dirty.set(false);
        this.notice.set(message);
        this.persist();
    }

    applyTemplate(
        templateId: TournamentBuilderDraft['templateId'],
    ): void {
        if (templateId === 'clone') return;
        const current = this.state();
        const template = createTournamentTemplate(templateId);
        template.localId = current.localId;
        template.tournamentId = current.tournamentId;
        template.ruleVersionId = current.ruleVersionId;
        template.lifecycleStatus = current.lifecycleStatus;
        template.details.seasonId = current.details.seasonId;
        if (current.details.name && templateId !== 'yard_league') {
            template.details.name = current.details.name;
            template.details.slug = current.details.slug;
        }
        this.replace(template);
    }

    cloneFrom(storageKey: string): boolean {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return false;
        try {
            const source = JSON.parse(raw) as TournamentBuilderDraft;
            const copy = clone(source);
            copy.removedStageParticipantIds ??= [];
            copy.localId = crypto.randomUUID();
            copy.tournamentId = undefined;
            copy.ruleVersionId = undefined;
            copy.lifecycleStatus = 'draft';
            copy.templateId = 'clone';
            copy.currentStep = 0;
            copy.details.name = `${source.details.name} — копия`;
            copy.details.slug = `${source.details.slug || 'tournament'}-copy`;
            copy.stages.forEach((stage) => {
                stage.serverId = undefined;
                stage.groups.forEach((group) => (group.serverId = undefined));
            });
            copy.participants.forEach((participant) => {
                participant.stageParticipantId = undefined;
            });
            copy.removedStageParticipantIds = [];
            this.replace(copy);
            return true;
        } catch {
            return false;
        }
    }

    listSavedDrafts(): SavedTournamentDraftSummary[] {
        const items: SavedTournamentDraftSummary[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const storageKey = localStorage.key(index);
            if (!storageKey?.startsWith(STORAGE_PREFIX)) continue;
            try {
                const draft = JSON.parse(
                    localStorage.getItem(storageKey) ?? '',
                ) as TournamentBuilderDraft;
                if (draft.localId === this.state().localId) continue;
                items.push({
                    storageKey,
                    tournamentId: draft.tournamentId,
                    name: draft.details.name || 'Без названия',
                    savedAt: draft.savedAt,
                });
            } catch {
                // Повреждённый локальный draft не должен ломать мастер.
            }
        }
        return items.sort((a, b) =>
            (b.savedAt ?? '').localeCompare(a.savedAt ?? ''),
        );
    }

    private persist(): void {
        const draft = this.state();
        localStorage.setItem(
            `${STORAGE_PREFIX}${draft.tournamentId ?? draft.localId}`,
            JSON.stringify(draft),
        );
    }
}
