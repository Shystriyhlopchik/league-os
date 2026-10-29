import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
    Component,
    computed,
    effect,
    ElementRef,
    HostListener,
    inject,
    signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

const enum MENU_ICON_LABEL {
    OPEN = 'Открыть меню',
    CLOSE = 'Закрыть меню',
}

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [RouterLink, RouterLinkActive, NgTemplateOutlet],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss',
})
export class HeaderComponent {
    private readonly document = inject(DOCUMENT);
    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

    readonly isMenuOpen = signal(false);
    readonly isAboutOpen = signal(false);
    readonly aboutLinks = [
        { path: '/regulations', label: 'Регламент соревнований' },
        { path: '/about/philosophy', label: 'Философия' },
        { path: '/about/history', label: 'История' },
    ];

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
        this.isAboutOpen.set(false);
        this.isMenuOpen.update((value) => !value);
    }

    closeMenu(): void {
        this.isAboutOpen.set(false);
        this.isMenuOpen.set(false);
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        if (this.isAboutOpen()) {
            this.element.nativeElement
                .querySelector<HTMLButtonElement>(
                    `${this.isMenuOpen() ? '#header-menu' : '.header__nav--desktop'} .header__about-toggle`,
                )
                ?.focus();
            this.isAboutOpen.set(false);
            return;
        }
        this.closeMenu();
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target;
        if (
            !(target instanceof Element) ||
            !this.element.nativeElement.contains(target) ||
            !target.closest('.header__about')
        ) {
            this.isAboutOpen.set(false);
        }
    }

    onAboutFocusOut(event: FocusEvent): void {
        if (
            !(event.relatedTarget instanceof Node) ||
            !(event.currentTarget as HTMLElement).contains(event.relatedTarget)
        ) {
            this.isAboutOpen.set(false);
        }
    }

    @HostListener('window:resize')
    onViewportResize(): void {
        this.isAboutOpen.set(false);
        const desktopViewport = this.document.defaultView?.matchMedia(
            '(min-width: 1240px)',
        ).matches;

        if (desktopViewport) {
            this.closeMenu();
        }
    }
}
