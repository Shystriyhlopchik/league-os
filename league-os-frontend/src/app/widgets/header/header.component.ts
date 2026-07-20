import { DOCUMENT } from '@angular/common';
import {
    Component,
    computed,
    effect,
    HostListener,
    inject,
    signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

const enum MENU_ICON_LABEL {
    OPEN = 'Открыть меню',
    CLOSE = 'Закрыть меню',
}

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss',
})
export class HeaderComponent {
    private readonly document = inject(DOCUMENT);

    readonly isMenuOpen = signal(false);

    readonly menuIconLabel = computed(() =>
        this.isMenuOpen() ? MENU_ICON_LABEL.CLOSE : MENU_ICON_LABEL.OPEN,
    );

    constructor() {
        effect((onCleanup) => {
            if (!this.isMenuOpen()) {
                return;
            }

            const previousOverflow = this.document.body.style.overflow;
            this.document.body.style.overflow = 'hidden';

            onCleanup(() => {
                this.document.body.style.overflow = previousOverflow;
            });
        });
    }

    toggleMenu(): void {
        this.isMenuOpen.update((value) => !value);
    }

    closeMenu(): void {
        this.isMenuOpen.set(false);
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        this.closeMenu();
    }

    @HostListener('window:resize')
    onViewportResize(): void {
        const desktopViewport = this.document.defaultView?.matchMedia(
            '(min-width: 768px)',
        ).matches;

        if (desktopViewport) {
            this.closeMenu();
        }
    }
}
