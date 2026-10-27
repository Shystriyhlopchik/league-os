import { ArrowUpRightComponent } from '../../shared/ui/arrow-up-right/arrow-up-right.component';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    signal,
    ViewContainerRef,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { PublicVideo, VideoApi } from '../../entities/video/video.api';
import { VideoPlayerComponent } from '../../entities/video/video-player.component';

@Component({
    selector: 'app-videos',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ArrowUpRightComponent, DatePipe, DialogModule],
    templateUrl: './videos.component.html',
    styleUrl: './videos.component.scss',
})
export class VideosComponent {
    private readonly api = inject(VideoApi);
    private readonly dialog = inject(Dialog);
    private readonly viewContainerRef = inject(ViewContainerRef);
    private readonly destroyRef = inject(DestroyRef);
    private player?: DialogRef<unknown, VideoPlayerComponent>;
    readonly videos = signal<PublicVideo[]>([]);
    readonly loading = signal(true);
    readonly failed = signal(false);

    constructor() {
        this.load();
        this.destroyRef.onDestroy(() => this.player?.close());
    }
    load(): void {
        this.loading.set(true);
        this.failed.set(false);
        this.api
            .featured()
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.loading.set(false)),
            )
            .subscribe({
                next: (videos) => this.videos.set(videos),
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
}
