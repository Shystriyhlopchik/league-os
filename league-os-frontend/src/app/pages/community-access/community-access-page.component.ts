import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
    Community,
    CommunityApi,
    CommunityAudit,
    CommunityContext,
    CommunityRole,
    CommunityUser,
} from '../../entities/community/community.api';
import { SessionStore } from '../../entities/user/model/session.store';
import { AuthApi } from '../../entities/user/api/auth.api';
import { TeamAccessRequestsComponent } from './team-access-requests.component';

@Component({
    selector: 'app-community-access-page',
    imports: [
        CommonModule,
        FormsModule,
        RouterLink,
        TeamAccessRequestsComponent,
    ],
    templateUrl: './community-access-page.component.html',
    styleUrl: './community-access-page.component.scss',
})
export class CommunityAccessPageComponent {
    private readonly api = inject(CommunityApi);
    private readonly auth = inject(AuthApi);
    readonly session = inject(SessionStore);
    readonly communities = signal<Community[]>([]);
    readonly selectedId = signal<number | null>(null);
    readonly selected = computed(() =>
        this.communities().find((c) => c.id === this.selectedId()),
    );
    readonly members = signal<CommunityUser[]>([]);
    readonly candidates = signal<CommunityUser[]>([]);
    readonly history = signal<CommunityAudit[]>([]);
    readonly context = signal<CommunityContext | null>(null);
    readonly busy = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly total = signal(0);
    readonly auditTotal = signal(0);
    readonly platformAdmin = computed(() =>
        this.session.hasRole('super_admin'),
    );
    page = 1;
    auditPage = 1;
    search = '';
    roleFilter = '';
    candidateSearch = '';
    communityName = '';
    communitySlug = '';
    competitionName = '';
    competitionSlug = '';
    competitionId = 0;
    seasonName = '';
    seasonSlug = '';
    seasonYear = new Date().getFullYear();
    readonly labels: Record<string, string> = {
        owner: 'Владелец',
        admin: 'Администратор',
        member: 'Участник',
    };

    constructor() {
        void this.run(async () => this.refresh());
    }

    async selectCommunity(id: number) {
        if (this.busy()) return;
        this.selectedId.set(id || null);
        this.page = 1;
        this.auditPage = 1;
        this.search = '';
        this.roleFilter = '';
        this.candidates.set([]);
        this.candidateSearch = '';
        await this.run(async () => this.loadSelected());
    }

    async refresh() {
        this.session.updateUser(await firstValueFrom(this.auth.me()));
        this.communities.set(await firstValueFrom(this.api.list()));
        if (!this.communities().some((c) => c.id === this.selectedId()))
            this.selectedId.set(this.communities()[0]?.id ?? null);
        await this.loadSelected();
    }

    private async loadSelected() {
        this.members.set([]);
        this.history.set([]);
        this.context.set(null);
        this.total.set(0);
        this.auditTotal.set(0);
        const community = this.selected();
        if (!community?.canManageTournaments) return;
        const id = community.id;
        const [members, context] = await Promise.all([
            firstValueFrom(
                this.api.members(id, this.search, this.page, this.roleFilter),
            ),
            firstValueFrom(this.api.context(id)),
        ]);
        this.members.set(members.items);
        this.total.set(members.total);
        this.context.set(context);
        if (!context.competitions.some((c) => c.id === this.competitionId))
            this.competitionId = context.competitions[0]?.id ?? 0;
        if (community.canManageMembers) {
            const history = await firstValueFrom(
                this.api.history(id, this.auditPage),
            );
            this.history.set(history.items);
            this.auditTotal.set(history.total);
        }
    }

    loadMembers(page = 1) {
        this.page = page;
        void this.run(async () => this.loadSelected());
    }

    loadHistory(page: number) {
        this.auditPage = page;
        void this.run(async () => this.loadSelected());
    }

    findUser() {
        const id = this.selectedId();
        if (!id) return;
        this.candidates.set([]);
        void this.run(async () => {
            const users = await firstValueFrom(
                this.api.candidates(id, this.candidateSearch),
            );
            this.candidates.set(users);
            if (!users.length)
                this.notice.set(
                    'Активный пользователь с таким логином или email не найден.',
                );
        });
    }

    setRole(user: CommunityUser, role: CommunityRole) {
        const id = this.selectedId();
        if (!id || this.busy()) return;
        const explanation =
            role === 'admin'
                ? 'Пользователь сможет создавать и управлять турнирами только этого сообщества.'
                : role === 'owner'
                  ? 'Пользователь сможет назначать администраторов этого сообщества.'
                  : 'Административный доступ и отдельные назначения на турниры будут отозваны, если они были предоставлены.';
        if (
            !window.confirm(
                `${user.lastName} ${user.firstName} (@${user.username})\nСообщество: ${this.selected()?.name}\nРоль: ${this.labels[role]}\n${explanation}`,
            )
        )
            return;
        void this.run(async () => {
            await firstValueFrom(this.api.setRole(id, user.id, role));
            this.candidates.set([]);
            await this.refresh();
            this.notice.set('Права пользователя обновлены.');
        });
    }

    remove(user: CommunityUser) {
        const id = this.selectedId();
        if (
            !id ||
            this.busy() ||
            !window.confirm(
                `Исключить ${user.lastName} ${user.firstName} (@${user.username}) из сообщества «${this.selected()?.name}»? Доступ к его турнирам будет отозван.`,
            )
        )
            return;
        void this.run(async () => {
            await firstValueFrom(this.api.remove(id, user.id));
            this.page = 1;
            await this.refresh();
            this.notice.set('Участие в сообществе прекращено.');
        });
    }

    createCommunity() {
        const user = this.session.user();
        if (!user) return;
        void this.run(async () => {
            const created = await firstValueFrom(
                this.api.create({
                    name: this.communityName.trim(),
                    slug: this.communitySlug,
                    ownerUserId: user.id,
                }),
            );
            this.selectedId.set(created.id);
            await this.refresh();
            this.communityName = this.communitySlug = '';
            this.notice.set('Сообщество создано. Вы назначены его владельцем.');
        });
    }

    createCompetition() {
        const id = this.selectedId();
        if (!id) return;
        void this.run(async () => {
            await firstValueFrom(
                this.api.competition(id, {
                    name: this.competitionName.trim(),
                    slug: this.competitionSlug,
                }),
            );
            await this.loadSelected();
            this.competitionName = this.competitionSlug = '';
            this.notice.set(
                'Серия соревнований создана. Теперь добавьте сезон.',
            );
        });
    }

    createSeason() {
        const id = this.selectedId();
        if (!id) return;
        void this.run(async () => {
            await firstValueFrom(
                this.api.season(id, {
                    competitionId: this.competitionId,
                    name: this.seasonName.trim(),
                    slug: this.seasonSlug,
                    year: this.seasonYear,
                }),
            );
            await this.loadSelected();
            this.seasonName = this.seasonSlug = '';
            this.notice.set('Сезон создан. Можно создавать его турниры.');
        });
    }

    userLabel(id: number | null) {
        if (id === null) return 'Серверная команда / миграция';
        const user = this.members().find((u) => u.id === id);
        return user
            ? `${user.lastName} ${user.firstName} (@${user.username})`
            : `Пользователь №${id}`;
    }

    private async run(action: () => Promise<void>) {
        if (this.busy()) return;
        this.busy.set(true);
        this.error.set('');
        this.notice.set('');
        try {
            await action();
        } catch (error: any) {
            const message = error?.error?.message;
            this.error.set(
                Array.isArray(message)
                    ? message.join('. ')
                    : message ||
                          'Не удалось выполнить действие. Обновите страницу и попробуйте снова.',
            );
            if (error?.status === 403 || error?.status === 401) {
                this.members.set([]);
                this.history.set([]);
                this.context.set(null);
                this.candidates.set([]);
                try {
                    this.session.updateUser(
                        await firstValueFrom(this.auth.me()),
                    );
                    this.communities.set(await firstValueFrom(this.api.list()));
                } catch {
                    this.communities.set([]);
                }
            }
        } finally {
            this.busy.set(false);
        }
    }
}
