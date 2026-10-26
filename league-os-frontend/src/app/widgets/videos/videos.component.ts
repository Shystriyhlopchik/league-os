import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    Input,
    OnInit,
    signal,
    ViewContainerRef,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, map } from 'rxjs';
import { RouterLink } from '@angular/router';
import { PublicVideo, VideoApi } from '../../entities/video/video.api';
import { VideoPlayerComponent } from '../../entities/video/video-player.component';

@Component({
    selector: 'app-videos',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe, DialogModule, RouterLink],
    templateUrl: './videos.component.html',
    styleUrl: './videos.component.scss',
})
export class VideosComponent implements OnInit {
    @Input() archive = false;
    private readonly api = inject(VideoApi);
    private readonly dialog = inject(Dialog);
    private readonly viewContainerRef = inject(ViewContainerRef);
    private readonly destroyRef = inject(DestroyRef);
    private player?: DialogRef<unknown, VideoPlayerComponent>;
    readonly videos = signal<PublicVideo[]>([]);
    readonly loading = signal(true);
    readonly failed = signal(false);
    readonly page = signal(1);
    readonly total = signal(0);
    readonly limit = 12;

    constructor() {
        this.destroyRef.onDestroy(() => this.player?.close());
    }
    ngOnInit(): void {
        this.load();
    }
    load(page = this.page()): void {
        this.page.set(page);
        this.loading.set(true);
        this.failed.set(false);
        const request = this.archive
            ? this.api.catalog(page)
            : this.api
                  .featured()
                  .pipe(map((items) => ({ items, total: items.length })));
        request
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.loading.set(false)),
            )
            .subscribe({
                next: (result) => {
                    this.videos.set(result.items);
                    this.total.set(result.total);
                },
                error: () => this.failed.set(true),
            });
    }
    play(video: PublicVideo): void {
        this.player?.close();
        this.player = this.dialog.open(VideoPlayerComponent, {
            data: video,
            viewContainerRef: this.viewContainerRef,
            width: '1000px',
            maxWidth: 'calc(100vw - 24px)',
            ariaLabelledBy: 'video-player-title',
            restoreFocus: true,
            autoFocus: 'first-tabbable',
        });
    }
    imageFailed(event: Event): void {
        (event.target as HTMLImageElement).hidden = true;
    }
    videoNumber(index: number): string {
        return String(
            (this.archive ? (this.page() - 1) * this.limit : 0) + index + 1,
        ).padStart(2, '0');
    }
}
