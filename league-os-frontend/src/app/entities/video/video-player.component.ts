import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { PublicVideo } from './video.api';

/** Defense in depth before granting Angular's resource URL trust. */
export function trustedVkEmbed(value: string): string | null {
    try {
        const url = new URL(value);
        if (
            url.origin !== 'https://vkvideo.ru' ||
            url.username ||
            url.password ||
            url.pathname !== '/video_ext.php'
        )
            return null;
        const allowed = ['oid', 'id', 'hash', 'autoplay'];
        if (
            [...url.searchParams.keys()].some(
                (k) =>
                    !allowed.includes(k) ||
                    url.searchParams.getAll(k).length !== 1,
            )
        )
            return null;
        if (
            !/^-?[1-9]\d{0,15}$/.test(url.searchParams.get('oid') ?? '') ||
            !/^[1-9]\d{0,15}$/.test(url.searchParams.get('id') ?? '')
        )
            return null;
        if (
            url.searchParams.has('hash') &&
            !/^[a-zA-Z0-9_-]{1,128}$/.test(url.searchParams.get('hash')!)
        )
            return null;
        url.searchParams.set('autoplay', '0');
        return url.toString();
    } catch {
        return null;
    }
}

@Component({
    selector: 'app-video-player',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: ` <div class="player">
        <header>
            <h2 id="video-player-title">{{ video.title }}</h2>
            <button
                type="button"
                (click)="dialog.close()"
                aria-label="Закрыть видео"
                cdkFocusInitial
            >
                ✕
            </button>
        </header>
        @if (url) {
            <iframe
                [src]="url"
                [title]="video.title"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowfullscreen
                referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>
        } @else {
            <p role="alert">Не удалось открыть плеер: некорректная ссылка.</p>
        }
        <p class="hint">
            Видео не запускается? Проверьте блокировщик рекламы или сообщите
            администратору. Доступность ролика задаётся в ВК.
        </p>
    </div>`,
    styles: `
        :host {
            display: block;
            width: 100%;
            max-height: 95dvh;
            overflow: auto;
            color: var(--brand-concrete);
            background: var(--brand-asphalt);
            border: 1px solid var(--brand-border);
        }
        header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            padding: 16px 20px;
        }
        h2 {
            font: 500 clamp(18px, 3vw, 26px) / 1.25 var(--brand-display-font);
            margin: 0;
            overflow-wrap: anywhere;
        }
        button {
            flex-shrink: 0;
            border: 1px solid var(--brand-border);
            background: var(--brand-surface);
            color: var(--brand-accent);
            width: 44px;
            height: 44px;
            cursor: pointer;
            font-size: 22px;
        }
        button:focus-visible {
            outline: 2px solid var(--brand-accent);
            outline-offset: 3px;
        }
        iframe {
            display: block;
            width: 100%;
            aspect-ratio: 16/9;
            border: 0;
            background: #000;
        }
        .hint {
            font-size: 12px;
            color: var(--brand-muted);
            margin: 0;
            padding: 12px 20px;
        }
    `,
})
export class VideoPlayerComponent {
    readonly video = inject<PublicVideo>(DIALOG_DATA);
    readonly dialog = inject(DialogRef);
    private readonly normalized = trustedVkEmbed(this.video.embedUrl);
    readonly url = this.normalized
        ? inject(DomSanitizer).bypassSecurityTrustResourceUrl(this.normalized)
        : null;
}
