import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, map, of, switchMap, tap, Subscription } from 'rxjs';
import { NewsApiService } from '../../entities/news/api/news.api.service';
import {
    SaveNewsRequest,
    VkConnection,
    NewsPublication,
    News,
} from '../../entities/news/model/news.types';
import { Community } from '../../entities/community/community.api';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
    selector: 'app-news-editor-page',
    imports: [ReactiveFormsModule, PageHeaderComponent],
    templateUrl: './news-editor-page.component.html',
    styleUrl: './news-editor-page.component.scss',
})
export class NewsEditorPageComponent implements OnInit, OnDestroy {
    private readonly api = inject(NewsApiService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly fb = inject(FormBuilder);

    readonly newsId = signal<number | null>(null);
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly error = signal('');
    readonly coverPreview = signal<string | null>(null);
    readonly communities = signal<Community[]>([]);
    readonly communityId = signal(0);
    readonly published = signal(false);
    readonly slugLocked = signal(false);
    readonly notice = signal('');
    readonly vkConnection = signal<VkConnection | null>(null);
    readonly vkPublication = signal<NewsPublication | null>(null);
    readonly vkBusy = signal(false);
    readonly vkError = signal('');
    readonly vkImagePreview = signal<string | null>(null);
    private vkImageUrl: string | null = null;
    private selectedVkFile: File | null = null;
    private vkLocalUrl: string | null = null;
    private poll?: ReturnType<typeof setInterval>;
    private readonly subscriptions = new Subscription();
    private selectedCoverFile: File | null = null;
    private localPreviewUrl: string | null = null;
    private coverUrl: string | null = null;

    readonly form = this.fb.nonNullable.group({
        title: [
            '',
            [
                Validators.required,
                Validators.minLength(3),
                Validators.maxLength(180),
            ],
        ],
        slug: ['', [Validators.maxLength(200)]],
        excerpt: ['', [Validators.maxLength(500)]],
        content: ['', [Validators.required, Validators.maxLength(50000)]],
        vkTitle: ['', Validators.maxLength(180)],
        vkText: ['', Validators.maxLength(12000)],
    });

    ngOnInit(): void {
        const rawId = this.route.snapshot.paramMap.get('newsId');
        if (!rawId) {
            this.loading.set(true);
            this.subscriptions.add(
                this.api
                    .communities()
                    .pipe(finalize(() => this.loading.set(false)))
                    .subscribe({
                        next: (items) => {
                            this.communities.set(items);
                            const requested = Number(
                                this.route.snapshot.queryParamMap.get(
                                    'communityId',
                                ),
                            );
                            this.selectCommunity(
                                items.find((c) => c.id === requested)?.id ??
                                    items[0]?.id ??
                                    0,
                            );
                            if (!items.length)
                                this.error.set(
                                    'Нет сообщества с правом управления новостями',
                                );
                        },
                        error: () =>
                            this.error.set('Не удалось загрузить сообщества'),
                    }),
            );
            return;
        }
        const newsId = Number(rawId);
        if (!Number.isInteger(newsId)) {
            this.error.set('Некорректный идентификатор новости');
            return;
        }
        this.newsId.set(newsId);
        this.loading.set(true);
        this.api
            .getAdminById(newsId)
            .pipe(finalize(() => this.loading.set(false)))
            .subscribe({
                next: (news) => {
                    this.coverUrl = news.coverUrl ?? null;
                    this.coverPreview.set(this.coverUrl);
                    this.communityId.set(news.communityId ?? 0);
                    this.published.set(news.status === 'published');
                    this.slugLocked.set(
                        news.slugLocked ?? news.status === 'published',
                    );
                    this.vkImageUrl = news.vkImageUrl ?? null;
                    this.vkImagePreview.set(this.vkImageUrl);
                    this.form.patchValue({
                        title: news.title,
                        slug: news.slug,
                        excerpt: news.excerpt ?? '',
                        content: news.content,
                        vkTitle: news.vkTitle ?? '',
                        vkText: news.vkText ?? '',
                    });
                    this.loadConnection();
                    this.refreshVk();
                    this.poll = setInterval(() => {
                        if (
                            ['queued', 'sending'].includes(
                                this.vkPublication()?.status ?? '',
                            )
                        )
                            this.refreshVk();
                    }, 5000);
                },
                error: (error) =>
                    this.error.set(
                        error?.error?.message || 'Не удалось загрузить новость',
                    ),
            });
    }

    save(publishAfterSave: boolean): void {
        this.form.markAllAsTouched();
        if (
            this.form.invalid ||
            this.saving() ||
            !this.communityId() ||
            this.vkBusy()
        )
            return;
        this.saving.set(true);
        this.error.set('');
        const value = this.form.getRawValue();
        const basePayload: SaveNewsRequest = {
            title: value.title.trim(),
            content: value.content.trim(),
            slug: value.slug.trim() || undefined,
            excerpt: value.excerpt.trim() || undefined,
            communityId: this.communityId(),
            vkTitle: value.vkTitle.trim(),
            vkText: value.vkText.trim(),
        };
        const coverRequest = this.selectedCoverFile
            ? this.api
                  .uploadCover(this.selectedCoverFile, this.communityId())
                  .pipe(
                      tap((result) => {
                          this.coverUrl = result.url;
                          this.selectedCoverFile = null;
                      }),
                      map((result) => result.url),
                  )
            : of(this.coverUrl);
        coverRequest
            .pipe(
                switchMap((coverUrl) =>
                    this.selectedVkFile
                        ? this.api
                              .uploadCover(
                                  this.selectedVkFile,
                                  this.communityId(),
                              )
                              .pipe(
                                  tap((result) => {
                                      this.vkImageUrl = result.url;
                                      this.selectedVkFile = null;
                                  }),
                                  map((result) => ({
                                      coverUrl,
                                      vkImageUrl: result.url,
                                  })),
                              )
                        : of({ coverUrl, vkImageUrl: this.vkImageUrl }),
                ),
                switchMap(({ coverUrl, vkImageUrl }) => {
                    const payload = {
                        ...basePayload,
                        coverUrl: coverUrl ?? '',
                        vkImageUrl: vkImageUrl ?? '',
                    };
                    const newsId = this.newsId();
                    return newsId
                        ? this.api.update(newsId, payload)
                        : this.api.create(payload);
                }),
                tap((news) => this.newsId.set(news.id)),
                switchMap((news) =>
                    publishAfterSave ? this.api.publish(news.id) : of(news),
                ),
                finalize(() => this.saving.set(false)),
            )
            .subscribe({
                next: (news: News) => {
                    this.published.set(news.status === 'published');
                    this.slugLocked.set(news.slugLocked ?? false);
                    this.form.patchValue({ slug: news.slug });
                    this.form.markAsPristine();
                    this.notice.set(
                        publishAfterSave
                            ? 'Новость опубликована на сайте. Теперь можно отправить анонс в ВК.'
                            : 'Изменения сохранены. Публикация в ВК выполняется отдельно.',
                    );
                    if (!this.route.snapshot.paramMap.get('newsId'))
                        void this.router.navigate(
                            ['/dashboard/new-news', news.id, 'edit'],
                            { replaceUrl: true },
                        );
                },
                error: (error) =>
                    this.error.set(
                        Array.isArray(error?.error?.message)
                            ? error.error.message.join('. ')
                            : error?.error?.message ||
                                  'Не удалось сохранить новость',
                    ),
            });
    }

    selectCover(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            this.error.set('Выберите изображение PNG, JPEG или WebP');
            input.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            this.error.set('Размер обложки не должен превышать 5 МБ');
            input.value = '';
            return;
        }
        this.revokeLocalPreview();
        this.selectedCoverFile = file;
        this.localPreviewUrl = URL.createObjectURL(file);
        this.coverPreview.set(this.localPreviewUrl);
        this.form.markAsDirty();
        this.error.set('');
    }

    removeCover(): void {
        this.revokeLocalPreview();
        this.selectedCoverFile = null;
        this.coverUrl = null;
        this.coverPreview.set(null);
        this.form.markAsDirty();
    }

    ngOnDestroy(): void {
        this.revokeLocalPreview();
        if (this.vkLocalUrl) URL.revokeObjectURL(this.vkLocalUrl);
        if (this.poll) clearInterval(this.poll);
        this.subscriptions.unsubscribe();
    }

    goBack(): void {
        this.router.navigate(['/dashboard/new-news'], {
            queryParams: { communityId: this.communityId() || undefined },
        });
    }

    private revokeLocalPreview(): void {
        if (this.localPreviewUrl) URL.revokeObjectURL(this.localPreviewUrl);
        this.localPreviewUrl = null;
    }

    selectCommunity(id: number): void {
        this.communityId.set(Number(id));
        this.vkConnection.set(null);
        if (id) this.loadConnection();
    }

    private loadConnection(): void {
        const communityId = this.communityId();
        this.subscriptions.add(
            this.api.vkConnection(communityId).subscribe({
                next: (result) => {
                    if (this.communityId() === communityId)
                        this.vkConnection.set(result);
                },
                error: () =>
                    this.vkError.set('Не удалось проверить настройки ВК'),
            }),
        );
    }

    checkConnection(): void {
        if (this.vkBusy()) return;
        this.vkBusy.set(true);
        this.vkError.set('');
        this.subscriptions.add(
            this.api
                .checkVkConnection(this.communityId())
                .pipe(finalize(() => this.vkBusy.set(false)))
                .subscribe({
                    next: (result) => {
                        this.vkConnection.set(result);
                        this.notice.set(
                            result.message ?? 'Подключение проверено',
                        );
                    },
                    error: (error) =>
                        this.vkError.set(
                            error?.error?.message ||
                                'Не удалось проверить доступ ВК',
                        ),
                }),
        );
    }

    fillVk(): void {
        this.form.patchValue({
            vkTitle: this.form.controls.title.value,
            vkText: this.form.controls.excerpt.value,
        });
        this.form.markAsDirty();
    }

    selectVkImage(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (
            !['image/jpeg', 'image/png'].includes(file.type) ||
            file.size > 5 * 1024 * 1024
        ) {
            this.vkError.set('Выберите JPEG или PNG размером до 5 МБ');
            input.value = '';
            return;
        }
        if (this.vkLocalUrl) URL.revokeObjectURL(this.vkLocalUrl);
        this.vkLocalUrl = URL.createObjectURL(file);
        this.selectedVkFile = file;
        this.vkImagePreview.set(this.vkLocalUrl);
        this.form.markAsDirty();
        this.vkError.set('');
    }

    removeVkImage(): void {
        if (this.vkLocalUrl) URL.revokeObjectURL(this.vkLocalUrl);
        this.vkLocalUrl = null;
        this.selectedVkFile = null;
        this.vkImageUrl = null;
        this.vkImagePreview.set(null);
        this.form.markAsDirty();
    }

    useCoverForVk(): void {
        if (this.selectedCoverFile) {
            if (
                !['image/jpeg', 'image/png'].includes(
                    this.selectedCoverFile.type,
                )
            ) {
                this.vkError.set(
                    'Для ВК нужна обложка JPEG или PNG. WebP можно оставить на сайте.',
                );
                return;
            }
            if (this.vkLocalUrl) URL.revokeObjectURL(this.vkLocalUrl);
            this.vkLocalUrl = URL.createObjectURL(this.selectedCoverFile);
            this.selectedVkFile = this.selectedCoverFile;
            this.vkImagePreview.set(this.vkLocalUrl);
        } else if (this.coverUrl && /\.(jpg|png)$/.test(this.coverUrl)) {
            this.removeVkImage();
            this.vkImageUrl = this.coverUrl;
            this.vkImagePreview.set(this.coverUrl);
        } else {
            this.vkError.set('Сначала загрузите обложку JPEG или PNG.');
            return;
        }
        this.form.markAsDirty();
        this.vkError.set('');
    }

    refreshVk(): void {
        const id = this.newsId();
        if (!id) return;
        this.subscriptions.add(
            this.api.vkStatus(id).subscribe({
                next: (result) => this.vkPublication.set(result),
                error: () =>
                    this.vkError.set(
                        'Не удалось обновить статус. Проверьте его перед повторной отправкой.',
                    ),
            }),
        );
    }

    sendVk(retry = false): void {
        const id = this.newsId();
        if (!id || !this.published() || this.vkBusy() || this.saving()) return;
        if (
            !retry &&
            (this.form.dirty || !this.form.controls.vkText.value.trim())
        ) {
            this.vkError.set(
                'Заполните текст анонса и сохраните изменения перед отправкой.',
            );
            return;
        }
        const uncertain = this.vkPublication()?.status === 'unknown';
        if (
            !confirm(
                uncertain
                    ? 'Проверьте стену сообщества ВК. Подтверждаете, что пост НЕ появился? Повтор может создать дубль, если пост уже существует.'
                    : retry
                      ? 'Повторить отправку ранее сохранённого текста и ссылки? Карточку ссылки ВК формирует по метаданным сайта.'
                      : 'Опубликовать анонс в подключённом сообществе ВК?',
            )
        )
            return;
        this.vkBusy.set(true);
        this.vkError.set('');
        this.subscriptions.add(
            (retry ? this.api.retryVk(id, uncertain) : this.api.sendVk(id))
                .pipe(finalize(() => this.vkBusy.set(false)))
                .subscribe({
                    next: (result) => this.vkPublication.set(result),
                    error: (error) => {
                        this.vkError.set(
                            error?.error?.message ||
                                'Не удалось отправить. Обновите статус перед повтором.',
                        );
                        this.refreshVk();
                    },
                }),
        );
    }
}
