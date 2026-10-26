import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NewsApiService } from '../../entities/news/api/news.api.service';
import { News } from '../../entities/news/model/news.types';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { Community } from '../../entities/community/community.api';

@Component({
    selector: 'app-news-management-page',
    imports: [DatePipe, RouterLink, PageHeaderComponent],
    templateUrl: './news-management-page.component.html',
    styleUrl: './news-management-page.component.scss',
})
export class NewsManagementPageComponent implements OnInit {
    private readonly api = inject(NewsApiService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    readonly communities = signal<Community[]>([]);
    readonly communityId = signal(0);

    readonly news = signal<News[]>([]);
    readonly loading = signal(true);
    readonly processingId = signal<number | null>(null);
    readonly error = signal('');

    ngOnInit(): void {
        this.api.communities().subscribe({
            next: (items) => {
                this.communities.set(items);
                const requested = Number(
                    this.route.snapshot.queryParamMap.get('communityId'),
                );
                this.communityId.set(
                    items.find((c) => c.id === requested)?.id ??
                        items[0]?.id ??
                        0,
                );
                if (this.communityId()) this.load();
                else {
                    this.loading.set(false);
                    this.error.set(
                        'Нет сообщества с правом управления новостями',
                    );
                }
            },
            error: () => {
                this.loading.set(false);
                this.error.set('Не удалось загрузить сообщества');
            },
        });
    }

    selectCommunity(id: number): void {
        this.communityId.set(Number(id));
        this.load();
    }

    load(): void {
        this.loading.set(true);
        this.error.set('');
        this.api
            .getAdminPage(1, 50, this.communityId())
            .pipe(finalize(() => this.loading.set(false)))
            .subscribe({
                next: (result) => this.news.set(result.items),
                error: (error) =>
                    this.error.set(
                        error?.error?.message ||
                            'Не удалось загрузить список новостей',
                    ),
            });
    }

    togglePublication(item: News): void {
        if (this.processingId()) return;
        if (
            item.status === 'published' &&
            !confirm(
                'Снять статью с публикации? Посты ВК не удаляются, а ссылки на статью станут недоступны.',
            )
        )
            return;
        this.processingId.set(item.id);
        const request =
            item.status === 'published'
                ? this.api.unpublish(item.id)
                : this.api.publish(item.id);
        request.pipe(finalize(() => this.processingId.set(null))).subscribe({
            next: (updated) =>
                this.news.update((items) =>
                    items.map((candidate) =>
                        candidate.id === updated.id ? updated : candidate,
                    ),
                ),
            error: (error) =>
                this.error.set(
                    error?.error?.message || 'Не удалось изменить публикацию',
                ),
        });
    }

    remove(item: News): void {
        if (
            this.processingId() ||
            !confirm(
                `Удалить новость «${item.title}»? Посты ВК не удалятся; ссылки на статью перестанут работать.`,
            )
        ) {
            return;
        }
        this.processingId.set(item.id);
        this.api
            .remove(item.id)
            .pipe(finalize(() => this.processingId.set(null)))
            .subscribe({
                next: () =>
                    this.news.update((items) =>
                        items.filter((candidate) => candidate.id !== item.id),
                    ),
                error: (error) =>
                    this.error.set(
                        error?.error?.message || 'Не удалось удалить новость',
                    ),
            });
    }

    goBack(): void {
        this.router.navigate(['/dashboard']);
    }
}
