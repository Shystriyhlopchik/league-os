import { CommonModule } from '@angular/common';
import {
    Component,
    HostListener,
    ViewChild,
    inject,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
    Community,
    CommunityApi,
} from '../../entities/community/community.api';
import {
    EditablePlayer,
    PlayerCorrection,
    PlayerIdentity,
    PlayerProfilesApi,
} from '../../entities/player/api/player-profiles.api';
import { PlayerProfileEditorComponent } from '../../shared/ui/player-profile-editor/player-profile-editor.component';

@Component({
    selector: 'app-player-profile-review-page',
    imports: [
        CommonModule,
        FormsModule,
        RouterLink,
        PlayerProfileEditorComponent,
    ],
    templateUrl: './player-profile-review-page.component.html',
    styleUrls: [
        '../team-workspace/team-workspace-page.component.scss',
        './player-profile-review-page.component.scss',
    ],
})
export class PlayerProfileReviewPageComponent {
    private readonly api = inject(PlayerProfilesApi);
    private readonly communityApi = inject(CommunityApi);
    @ViewChild(PlayerProfileEditorComponent)
    editor?: PlayerProfileEditorComponent;
    readonly communities = signal<Community[]>([]);
    readonly communityId = signal(0);
    readonly requests = signal<PlayerCorrection[]>([]);
    readonly players = signal<EditablePlayer[]>([]);
    readonly selectedPlayerId = signal<number | null>(null);
    readonly busy = signal(false);
    readonly editorBusy = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly requestTotal = signal(0);
    readonly playerTotal = signal(0);
    requestPage = 1;
    playerPage = 1;
    search = '';
    comments: Record<number, string> = {};
    eligibility: Record<number, string> = {};
    duplicates: Record<number, string> = {};
    constructor() {
        void this.run(async () => {
            const communities = (
                await firstValueFrom(this.communityApi.list())
            ).filter((c) => c.canManageTournaments);
            this.communities.set(communities);
            this.communityId.set(communities[0]?.id || 0);
            if (this.communityId()) await this.load();
        });
    }
    hasUnsavedChanges() {
        return (
            !!this.editor?.hasUnsavedChanges() ||
            [
                ...Object.values(this.comments),
                ...Object.values(this.eligibility),
                ...Object.values(this.duplicates),
            ].some((v) => v.trim())
        );
    }
    canLeavePage() {
        return (
            !this.busy() &&
            !this.editorBusy() &&
            (!this.hasUnsavedChanges() ||
                window.confirm(
                    'Покинуть страницу без сохранения введённых изменений?',
                ))
        );
    }
    @HostListener('window:beforeunload', ['$event']) beforeUnload(
        event: BeforeUnloadEvent,
    ) {
        if (this.hasUnsavedChanges() || this.busy() || this.editorBusy()) {
            event.preventDefault();
            event.returnValue = '';
        }
    }
    changeCommunity(select: HTMLSelectElement) {
        const id = Number(select.value);
        select.value = String(this.communityId());
        if (!this.canLeavePage()) return;
        this.communityId.set(id);
        this.requestPage = this.playerPage = 1;
        this.comments = {};
        this.eligibility = {};
        this.duplicates = {};
        this.selectedPlayerId.set(null);
        this.requests.set([]);
        this.players.set([]);
        void this.run(() => this.load());
    }
    private async load() {
        await Promise.all([this.loadRequests(), this.loadPlayers()]);
    }
    private async loadRequests() {
        const result = await firstValueFrom(
            this.api.requests(this.communityId(), this.requestPage),
        );
        this.requests.set(result.items);
        this.requestTotal.set(result.total);
    }
    private async loadPlayers() {
        const result = await firstValueFrom(
            this.api.search(this.communityId(), this.search, this.playerPage),
        );
        this.players.set(result.items);
        this.playerTotal.set(result.total);
    }
    refresh() {
        return this.run(async () => {
            if (!this.communities().length) {
                const communities = (
                    await firstValueFrom(this.communityApi.list())
                ).filter((c) => c.canManageTournaments);
                this.communities.set(communities);
                this.communityId.set(communities[0]?.id || 0);
            }
            if (this.communityId()) await this.load();
        });
    }
    searchPlayers() {
        this.playerPage = 1;
        return this.run(() => this.loadPlayers());
    }
    nextRequests(delta: number) {
        this.requestPage += delta;
        return this.run(() => this.loadRequests());
    }
    nextPlayers(delta: number) {
        this.playerPage += delta;
        return this.run(() => this.loadPlayers());
    }
    openPlayer(id: number) {
        if (
            this.editorBusy() ||
            (this.editor?.hasUnsavedChanges() &&
                !window.confirm('Закрыть профиль без сохранения?'))
        )
            return;
        this.selectedPlayerId.set(id);
    }
    async decide(request: PlayerCorrection, decision: 'approve' | 'return') {
        if (decision === 'return' && !this.comments[request.id]?.trim()) {
            this.error.set('Для возврата укажите комментарий');
            return;
        }
        if (
            decision === 'approve' &&
            !window.confirm(
                'Подтвердить исправление общей карточки того же игрока? Составы и статистика сохранятся.',
            )
        )
            return;
        await this.run(async () => {
            await firstValueFrom(
                this.api.review(this.communityId(), request.id, {
                    decision,
                    comment: this.comments[request.id],
                    eligibilityComment: this.eligibility[request.id],
                    duplicateComment: this.duplicates[request.id],
                }),
            );
            delete this.comments[request.id];
            delete this.eligibility[request.id];
            delete this.duplicates[request.id];
            this.notice.set(
                decision === 'approve'
                    ? 'Карточка исправлена. Составы и статистика сохранены.'
                    : 'Исправление возвращено с комментарием. Управляющий командой может подготовить новый запрос.',
            );
            if (
                this.selectedPlayerId() === request.playerId &&
                !this.editor?.hasUnsavedChanges()
            )
                await this.editor?.reload();
            await this.load();
        });
    }
    name(p: PlayerIdentity) {
        return [p.lastName, p.firstName, p.middleName]
            .filter(Boolean)
            .join(' ');
    }
    private async run(action: () => Promise<void>) {
        if (this.busy() || this.editorBusy()) return;
        this.busy.set(true);
        this.error.set('');
        this.notice.set('');
        try {
            await action();
        } catch (e) {
            const m = (e as { error?: { message?: string | string[] } }).error
                ?.message;
            this.error.set(
                Array.isArray(m)
                    ? m.join('. ')
                    : m || 'Не удалось выполнить действие',
            );
        } finally {
            this.busy.set(false);
        }
    }
}
