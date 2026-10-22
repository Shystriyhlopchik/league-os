import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, map, of, switchMap } from 'rxjs';
import { NewsApiService } from '../../entities/news/api/news.api.service';
import { SaveNewsRequest } from '../../entities/news/model/news.types';
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
    });

    ngOnInit(): void {
        const rawId = this.route.snapshot.paramMap.get('newsId');
        if (!rawId) return;
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
                    this.form.setValue({
                        title: news.title,
                        slug: news.slug,
                        excerpt: news.excerpt ?? '',
                        content: news.content,
                    });
                },
                error: (error) =>
                    this.error.set(
                        error?.error?.message || 'Не удалось загрузить новость',
                    ),
            });
    }

    save(publishAfterSave: boolean): void {
        this.form.markAllAsTouched();
        if (this.form.invalid || this.saving()) return;
        this.saving.set(true);
        this.error.set('');
        const value = this.form.getRawValue();
        const basePayload: SaveNewsRequest = {
            title: value.title.trim(),
            content: value.content.trim(),
            slug: value.slug.trim() || undefined,
            excerpt: value.excerpt.trim() || undefined,
        };
        const coverRequest = this.selectedCoverFile
            ? this.api
                  .uploadCover(this.selectedCoverFile)
                  .pipe(map((result) => result.url))
            : of(this.coverUrl);
        coverRequest
            .pipe(
                switchMap((coverUrl) => {
                    const payload = {
                        ...basePayload,
                        coverUrl: coverUrl ?? '',
                    };
                    const newsId = this.newsId();
                    return newsId
                        ? this.api.update(newsId, payload)
                        : this.api.create(payload);
                }),
                switchMap((news) =>
                    publishAfterSave ? this.api.publish(news.id) : of(news),
                ),
                finalize(() => this.saving.set(false)),
            )
            .subscribe({
                next: () => this.router.navigate(['/dashboard/new-news']),
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
        this.error.set('');
    }

    removeCover(): void {
        this.revokeLocalPreview();
        this.selectedCoverFile = null;
        this.coverUrl = null;
        this.coverPreview.set(null);
    }

    ngOnDestroy(): void {
        this.revokeLocalPreview();
    }

    goBack(): void {
        this.router.navigate(['/dashboard/new-news']);
    }

    private revokeLocalPreview(): void {
        if (this.localPreviewUrl) URL.revokeObjectURL(this.localPreviewUrl);
        this.localPreviewUrl = null;
    }
}
