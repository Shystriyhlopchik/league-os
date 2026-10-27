import { DOCUMENT } from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    inject,
    InjectionToken,
    NgZone,
    signal,
    ViewChild,
} from '@angular/core';

export interface YandexAdOptions {
    blockId: string;
    renderTo: string;
    darkTheme: boolean;
    onError: (error: { type: 'error' | 'warning' }) => void;
    onRender: () => void;
}

export interface YandexAdWindow {
    location: Pick<Location, 'hostname'>;
    setTimeout: Window['setTimeout'];
    clearTimeout: Window['clearTimeout'];
    yaContextCb?: { push(callback: () => void): unknown };
    Ya?: {
        Context?: {
            AdvManager?: {
                render(options: YandexAdOptions, fallback?: () => void): void;
                destroy?(options: { renderTo: string }): void;
            };
        };
    };
}

export const YAN_WINDOW = new InjectionToken<YandexAdWindow | null>(
    'YAN_WINDOW',
    {
        providedIn: 'root',
        factory: () => inject(DOCUMENT).defaultView as YandexAdWindow | null,
    },
);

export const YAN_CONFIG = new InjectionToken<{
    blockId: string;
    allowedHosts: readonly string[];
}>('YAN_CONFIG', {
    providedIn: 'root',
    factory: () => ({
        blockId: 'R-A-20290516-1',
        allowedHosts: ['liga-dvora.ru', 'www.liga-dvora.ru'],
    }),
});

let slotSequence = 0;

@Component({
    selector: 'app-yandex-ad',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './yandex-ad.component.html',
    styleUrl: './yandex-ad.component.scss',
    host: { '[class.yan-ad--inactive]': '!enabled || unavailable()' },
})
export class YandexAdComponent {
    private readonly win = inject(YAN_WINDOW);
    private readonly config = inject(YAN_CONFIG);
    private readonly zone = inject(NgZone);
    private readonly destroyRef = inject(DestroyRef);
    @ViewChild('slot') private slot?: ElementRef<HTMLDivElement>;

    readonly enabled =
        !!this.win &&
        this.config.allowedHosts.includes(this.win.location.hostname);
    readonly unavailable = signal(false);
    // Route re-entry gets a new target, so a late SDK response cannot fill a new page's slot.
    readonly containerId = `yandex_rtb_${this.config.blockId}_${++slotSequence}`;
    private disposed = false;
    private requested = false;
    private rendered = false;
    private released = false;
    private loaderTimer?: number;
    private queued?: () => void;
    private queue?: YandexAdWindow['yaContextCb'];

    constructor() {
        afterNextRender(() => {
            if (this.enabled && !this.disposed) {
                this.zone.runOutsideAngular(() => this.mount());
            }
        });
        this.destroyRef.onDestroy(() => {
            this.disposed = true;
            this.clearLoaderTimer();
            this.removeQueuedCallback();
            this.release();
        });
    }

    private mount(): void {
        const win = this.win;
        if (!win || !this.slot) return;
        const render = () => {
            if (this.disposed || this.requested || this.unavailable()) return;
            this.clearLoaderTimer();
            const manager = win.Ya?.Context?.AdvManager;
            if (!manager || !this.slot?.nativeElement.isConnected) {
                this.fail();
                return;
            }
            this.requested = true;
            try {
                manager.render(
                    {
                        blockId: this.config.blockId,
                        renderTo: this.containerId,
                        darkTheme: true,
                        onError: (error) => {
                            // A warning can accompany an actual ad; do not hide that ad.
                            if (error.type === 'error') this.fail();
                        },
                        onRender: () => {
                            if (!this.disposed) this.rendered = true;
                        },
                    },
                    () => this.fail(),
                );
            } catch {
                this.fail();
            }
        };
        if (win.Ya?.Context?.AdvManager) {
            render();
        } else {
            // Only time out SDK loading. Never remove a displayed ad on a timer.
            this.loaderTimer = win.setTimeout(() => this.fail(), 15_000);
            this.queued = render;
            this.queue = win.yaContextCb ??= [];
            this.queue.push(render);
        }
    }

    private fail(): void {
        if (this.disposed || this.rendered || this.unavailable()) return;
        this.clearLoaderTimer();
        this.removeQueuedCallback();
        this.release();
        this.zone.run(() => this.unavailable.set(true));
    }

    private clearLoaderTimer(): void {
        if (this.loaderTimer !== undefined)
            this.win?.clearTimeout(this.loaderTimer);
        this.loaderTimer = undefined;
    }

    private removeQueuedCallback(): void {
        if (Array.isArray(this.queue) && this.queued) {
            const index = this.queue.indexOf(this.queued);
            if (index >= 0) this.queue.splice(index, 1);
        }
        this.queued = undefined;
    }

    private release(): void {
        if (!this.requested || this.released) return;
        this.released = true;
        try {
            this.win?.Ya?.Context?.AdvManager?.destroy?.({
                renderTo: this.containerId,
            });
        } catch {
            // SDK/ad-blocker failures must not interrupt application navigation.
        }
    }
}
