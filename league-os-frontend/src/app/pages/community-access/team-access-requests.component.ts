import {
    Component,
    DestroyRef,
    inject,
    input,
    OnChanges,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
    TeamAccessRequest,
    TeamWorkspaceApi,
} from '../../entities/team/api/team-workspace.api';

@Component({
    selector: 'app-team-access-requests',
    imports: [FormsModule],
    template: `
        <section class="panel" id="team-access-requests">
            <h2>Запросы доступа к командам</h2>
            <p>
                Проверьте связь заявителя с командой. Подтверждение выдаёт
                управление командой, но не права администратора сообщества и не
                допуск к турниру.
            </p>
            @if (error()) {
                <p class="message error" role="alert">{{ error() }}</p>
            }
            @if (notice()) {
                <p class="message success" role="status">{{ notice() }}</p>
            }
            @if (busy()) {
                <p role="status">Загрузка…</p>
            }
            <button (click)="load()" [disabled]="busy()">
                Обновить запросы
            </button>
            @for (request of requests(); track request.id) {
                <article class="panel">
                    <h3>{{ request.teamName }}</h3>
                    <p>{{ request.name }} · &#64;{{ request.username }}</p>
                    <p>{{ request.reason }}</p>
                    <label
                        >Комментарий к решению<textarea
                            maxlength="1000"
                            [(ngModel)]="comments[request.id]"
                            [disabled]="busy()"
                            placeholder="При отказе обязателен"
                        ></textarea>
                    </label>
                    <div class="actions">
                        <button
                            (click)="review(request, 'approve')"
                            [disabled]="busy()"
                        >
                            Подтвердить доступ
                        </button>
                        <button
                            (click)="review(request, 'reject')"
                            [disabled]="busy() || !comments[request.id]?.trim()"
                        >
                            Отклонить с комментарием
                        </button>
                    </div>
                </article>
            } @empty {
                @if (loaded() && !busy()) {
                    <p>Новых запросов нет.</p>
                }
            }
        </section>
    `,
    styleUrl: './community-access-page.component.scss',
})
export class TeamAccessRequestsComponent implements OnChanges {
    readonly communityId = input.required<number>();
    private readonly api = inject(TeamWorkspaceApi);
    readonly requests = signal<TeamAccessRequest[]>([]);
    readonly busy = signal(false);
    readonly loaded = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    comments: Partial<Record<number, string>> = {};
    private generation = 0;
    constructor() {
        inject(DestroyRef).onDestroy(() => this.generation++);
    }
    ngOnChanges() {
        this.comments = {};
        this.requests.set([]);
        this.loaded.set(false);
        void this.load();
    }
    load() {
        return this.run();
    }
    review(request: TeamAccessRequest, decision: 'approve' | 'reject') {
        if (
            this.busy() ||
            (decision === 'reject' && !this.comments[request.id]?.trim())
        )
            return;
        if (
            decision === 'approve' &&
            !window.confirm(
                `Предоставить ${request.name} (@${request.username}) управление командой «${request.teamName}»?`,
            )
        )
            return;
        return this.run({
            request,
            decision,
            comment: this.comments[request.id] || '',
        });
    }
    private async run(review?: {
        request: TeamAccessRequest;
        decision: 'approve' | 'reject';
        comment: string;
    }) {
        const generation = ++this.generation,
            communityId = this.communityId();
        this.busy.set(true);
        this.error.set('');
        this.notice.set('');
        try {
            if (review)
                await firstValueFrom(
                    this.api.review(
                        communityId,
                        review.request.id,
                        review.decision,
                        review.comment,
                    ),
                );
            const requests = await firstValueFrom(
                this.api.requests(communityId),
            );
            if (generation !== this.generation) return;
            this.requests.set(requests);
            this.loaded.set(true);
            if (review) {
                delete this.comments[review.request.id];
                this.notice.set('Решение по доступу сохранено');
            }
        } catch (error) {
            if (generation !== this.generation) return;
            const message = (
                error as { error?: { message?: string | string[] } }
            ).error?.message;
            this.error.set(
                Array.isArray(message)
                    ? message.join('. ')
                    : message || 'Не удалось загрузить или рассмотреть запросы',
            );
        } finally {
            if (generation === this.generation) this.busy.set(false);
        }
    }
}
