import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    HostListener,
    inject,
    Injector,
    signal,
    viewChild,
    ViewContainerRef,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom, forkJoin } from 'rxjs';
import {
    Community,
    CommunityApi,
} from '../../entities/community/community.api';
import {
    PublicVideo,
    Video,
    VideoApi,
    VideoOptions,
    VideoPage,
} from '../../entities/video/video.api';
import { VideoPlayerComponent } from '../../entities/video/video-player.component';

const emptyForm = {
    title: '',
    source: '',
    status: 'draft' as 'draft' | 'published',
    showOnHome: true,
    sortOrder: 0,
    tournamentId: null as number | null,
    matchId: null as number | null,
};

@Component({
    selector: 'app-videos-management',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, RouterLink, DatePipe, DialogModule],
    templateUrl: './videos-management.component.html',
    styleUrl: './videos-management.component.scss',
})
export class VideosManagementComponent {
    private readonly api = inject(VideoApi);
    private readonly communityApi = inject(CommunityApi);
    private readonly dialog = inject(Dialog);
    private readonly viewContainerRef = inject(ViewContainerRef);
    private readonly fb = inject(FormBuilder);
    private readonly injector = inject(Injector);
    private readonly editorHeading =
        viewChild<ElementRef<HTMLHeadingElement>>('editorHeading');
    private player?: DialogRef<unknown, VideoPlayerComponent>;
    private file: File | null = null;
    private objectUrl: string | null = null;
    private optionsRequest = 0;
    readonly communities = signal<Community[]>([]);
    readonly communityId = signal<number | null>(null);
    readonly page = signal<VideoPage>({
        items: [],
        total: 0,
        homeCount: 0,
        page: 1,
        limit: 20,
    });
    readonly options = signal<VideoOptions>({ tournaments: [], matches: [] });
    readonly loading = signal(true);
    readonly saving = signal(false);
    readonly optionsLoading = signal(false);
    readonly editorOpen = signal(false);
    readonly editingId = signal<number | null>(null);
    readonly coverUrl = signal<string | null>(null);
    readonly coverPreview = signal<string | null>(null);
    readonly error = signal('');
    readonly notice = signal('');
    readonly form = this.fb.group({
        title: this.fb.nonNullable.control('', [
            Validators.required,
            Validators.maxLength(180),
            Validators.pattern(/\S/),
        ]),
        source: this.fb.nonNullable.control('', [
            Validators.required,
            Validators.maxLength(5000),
            Validators.pattern(/\S/),
        ]),
        status: this.fb.nonNullable.control<'draft' | 'published'>('draft'),
        showOnHome: this.fb.nonNullable.control(true),
        sortOrder: this.fb.nonNullable.control(0, [
            Validators.required,
            Validators.min(0),
            Validators.max(9999),
            Validators.pattern(/^\d+$/),
        ]),
        tournamentId: this.fb.control<number | null>(null),
        matchId: this.fb.control<number | null>(null),
    });

    constructor() {
        void this.initialize();
        inject(DestroyRef).onDestroy(() => {
            this.revokePreview();
            this.player?.close();
        });
    }
    private async initialize() {
        try {
            const communities = (
                await firstValueFrom(this.communityApi.list())
            ).filter((c) => c.canManageTournaments);
            this.communities.set(communities);
            if (communities.length) await this.loadCommunity(communities[0].id);
        } catch (error) {
            this.showError(error);
        } finally {
            this.loading.set(false);
        }
    }
    async changeCommunity(event: Event) {
        const select = event.target as HTMLSelectElement;
        if (!this.canLeave()) {
            select.value = String(this.communityId());
            return;
        }
        await this.loadCommunity(Number(select.value));
    }
    private async loadCommunity(id: number) {
        this.loading.set(true);
        this.error.set('');
        this.notice.set('');
        this.resetEditor();
        this.communityId.set(id);
        this.page.set({
            items: [],
            total: 0,
            homeCount: 0,
            page: 1,
            limit: 20,
        });
        this.options.set({ tournaments: [], matches: [] });
        try {
            const data = await firstValueFrom(
                forkJoin({
                    page: this.api.list(id),
                    options: this.api.options(id),
                }),
            );
            this.page.set(data.page);
            this.options.set(data.options);
        } catch (error) {
            this.showError(error);
        } finally {
            this.loading.set(false);
        }
    }
    async loadPage(page: number) {
        if (!this.communityId() || this.loading()) return;
        this.loading.set(true);
        this.error.set('');
        try {
            this.page.set(
                await firstValueFrom(this.api.list(this.communityId()!, page)),
            );
        } catch (error) {
            this.showError(error);
        } finally {
            this.loading.set(false);
        }
    }
    create() {
        if (!this.canLeave()) return;
        this.resetEditor();
        this.error.set('');
        this.notice.set('');
        this.editorOpen.set(true);
        this.focusEditor();
    }
    edit(video: Video) {
        if (!this.canLeave()) return;
        this.resetEditor();
        this.error.set('');
        this.notice.set('');
        this.editingId.set(video.id);
        this.coverUrl.set(video.coverUrl);
        this.coverPreview.set(video.coverUrl);
        this.form.reset({
            title: video.title,
            source: video.embedUrl,
            status: video.status,
            showOnHome: video.showOnHome,
            sortOrder: video.sortOrder,
            tournamentId: video.tournamentId,
            matchId: video.matchId,
        });
        this.editorOpen.set(true);
        this.focusEditor();
        void this.loadOptions(video.tournamentId);
    }
    cancel() {
        if (this.canLeave()) {
            this.resetEditor();
            this.error.set('');
        }
    }
    private resetEditor() {
        ++this.optionsRequest;
        this.optionsLoading.set(false);
        this.revokePreview();
        this.file = null;
        this.coverUrl.set(null);
        this.coverPreview.set(null);
        this.form.reset(emptyForm);
        this.editingId.set(null);
        this.editorOpen.set(false);
    }
    async tournamentChanged() {
        this.form.controls.matchId.setValue(null);
        await this.loadOptions(this.form.controls.tournamentId.value);
    }
    private async loadOptions(tournamentId: number | null) {
        const request = ++this.optionsRequest;
        this.options.update((v) => ({ ...v, matches: [] }));
        this.optionsLoading.set(true);
        try {
            const options = await firstValueFrom(
                this.api.options(this.communityId()!, tournamentId),
            );
            if (request === this.optionsRequest) this.options.set(options);
        } catch (error) {
            if (request === this.optionsRequest) this.showError(error);
        } finally {
            if (request === this.optionsRequest) this.optionsLoading.set(false);
        }
    }
    selectCover(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
            file.size > 5 * 1024 * 1024
        ) {
            this.error.set('Выберите PNG, JPEG или WebP размером до 5 МБ.');
            return;
        }
        this.error.set('');
        this.file = file;
        this.revokePreview();
        this.objectUrl = URL.createObjectURL(file);
        this.coverPreview.set(this.objectUrl);
        this.form.markAsDirty();
    }
    async save() {
        if (this.saving() || this.optionsLoading() || !this.communityId())
            return;
        this.form.markAllAsTouched();
        this.error.set('');
        this.notice.set('');
        if (this.form.invalid) {
            this.error.set('Проверьте название, ссылку ВК и порядок показа.');
            return;
        }
        const value = this.form.getRawValue();
        if (value.status === 'published' && !this.file && !this.coverUrl()) {
            this.error.set('Для публикации нужна обложка.');
            return;
        }
        this.saving.set(true);
        try {
            if (this.file) {
                const cover = await firstValueFrom(
                    this.api.upload(this.communityId()!, this.file),
                );
                this.coverUrl.set(cover.url);
                this.file = null;
            }
            await firstValueFrom(
                this.api.save(this.communityId()!, this.editingId(), {
                    ...value,
                    title: value.title.trim(),
                    source: value.source.trim(),
                    coverUrl: this.coverUrl(),
                }),
            );
            this.resetEditor();
            this.notice.set(
                value.status === 'published'
                    ? 'Видео опубликовано. Изменения появятся на главной после её обновления.'
                    : 'Черновик сохранён. Проверьте плеер перед публикацией.',
            );
            await this.loadPage(1);
        } catch (error) {
            this.showError(error);
        } finally {
            this.saving.set(false);
        }
    }
    async archive(video: Video) {
        if (
            !window.confirm(
                `Убрать видео «${video.title}» из публикаций и списка? Файл в ВК останется.`,
            )
        )
            return;
        this.saving.set(true);
        this.error.set('');
        this.notice.set('');
        try {
            await firstValueFrom(
                this.api.archive(this.communityId()!, video.id),
            );
            if (this.editingId() === video.id) this.resetEditor();
            this.notice.set(
                'Видео убрано в архив. Ролик ВК и обложка не удалены.',
            );
            await this.loadPage(1);
        } catch (error) {
            this.showError(error);
        } finally {
            this.saving.set(false);
        }
    }
    preview(video: PublicVideo) {
        this.player?.close();
        this.player = this.dialog.open(VideoPlayerComponent, {
            data: video,
            viewContainerRef: this.viewContainerRef,
            width: '1000px',
            maxWidth: 'calc(100vw - 24px)',
            ariaLabelledBy: 'video-player-title',
            restoreFocus: true,
        });
    }
    canLeave(): boolean {
        return (
            !this.saving() &&
            (!this.editorOpen() ||
                !this.form.dirty ||
                window.confirm('Оставить несохранённые изменения видео?'))
        );
    }
    @HostListener('window:beforeunload', ['$event']) beforeUnload(
        event: BeforeUnloadEvent,
    ) {
        if (this.saving() || (this.editorOpen() && this.form.dirty)) {
            event.preventDefault();
            event.returnValue = '';
        }
    }
    private revokePreview() {
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
    }
    private focusEditor() {
        afterNextRender(
            () => {
                const heading = this.editorHeading()?.nativeElement;
                heading?.focus({ preventScroll: true });
                heading?.scrollIntoView({
                    block: 'start',
                    behavior: window.matchMedia(
                        '(prefers-reduced-motion: reduce)',
                    ).matches
                        ? 'auto'
                        : 'smooth',
                });
            },
            { injector: this.injector },
        );
    }
    private showError(error: unknown) {
        const message = (error as { error?: { message?: string | string[] } })
            ?.error?.message;
        this.error.set(
            Array.isArray(message)
                ? message.join('. ')
                : message ||
                      'Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.',
        );
    }
}
