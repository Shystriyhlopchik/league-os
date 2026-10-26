import { DOCUMENT } from '@angular/common';
import {
    Component,
    computed,
    effect,
    ElementRef,
    HostListener,
    inject,
    signal,
} from '@angular/core';
import {
    NavigationEnd,
    Router,
    RouterLink,
    RouterLinkActive,
} from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

const enum MENU_ICON_LABEL {
    OPEN = 'Открыть меню',
    CLOSE = 'Закрыть меню',
}

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [RouterLink, RouterLinkActive, A11yModule],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss',
})
export class HeaderComponent {
    private readonly document = inject(DOCUMENT);
    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly router = inject(Router);

    readonly isMenuOpen = signal(false);
    readonly openGroup = signal<string | null>(null);
    readonly groups = [
        {
            id: 'tournament',
            label: 'Турнир',
            links: [
                { path: '/matches', label: 'Матчи' },
                { path: '/statistics', label: 'Таблица' },
                { path: '/champion', label: 'Чемпион' },
                { path: '/regulations', label: 'Регламент соревнований' },
            ],
        },
        {
            id: 'participants',
            label: 'Участники',
            links: [
                { path: '/team', label: 'Команды' },
                { path: '/players', label: 'Игроки' },
                { path: '/ranking', label: 'Рейтинг' },
            ],
        },
        {
            id: 'media',
            label: 'Медиа',
            links: [
                { path: '/news', label: 'Новости' },
                { path: '/videos', label: 'Видео' },
            ],
        },
    ];

    readonly menuIconLabel = computed(() =>
        this.isMenuOpen() ? MENU_ICON_LABEL.CLOSE : MENU_ICON_LABEL.OPEN,
    );

    constructor() {
        this.router.events
            .pipe(
                filter((event) => event instanceof NavigationEnd),
                takeUntilDestroyed(),
            )
            .subscribe(() => this.closeMenu());
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
        this.openGroup.set(null);
        this.isMenuOpen.update((value) => !value);
    }

    toggleGroup(id: string): void {
        this.openGroup.update((value) => (value === id ? null : id));
    }

    onGroupFocusOut(event: FocusEvent): void {
        if (
            !(event.currentTarget as HTMLElement).contains(
                event.relatedTarget as Node | null,
            )
        ) {
            this.openGroup.set(null);
        }
    }

    closeMenu(): void {
        this.isMenuOpen.set(false);
        this.openGroup.set(null);
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        const group = this.openGroup();
        if (group) {
            this.element.nativeElement
                .querySelector<HTMLButtonElement>(`#header-group-${group}`)
                ?.focus();
        } else if (this.isMenuOpen()) {
            this.element.nativeElement
                .querySelector<HTMLButtonElement>('.header__action--menu')
                ?.focus();
        }
        this.closeMenu();
    }

    @HostListener('document:click', ['$event'])
    onOutsideClick(event: MouseEvent): void {
        if (!this.element.nativeElement.contains(event.target as Node))
            this.closeMenu();
    }

    @HostListener('window:resize')
    onViewportResize(): void {
        this.openGroup.set(null);
        const desktopViewport = this.document.defaultView?.matchMedia(
            '(min-width: 1240px)',
        ).matches;

        if (desktopViewport) {
            this.closeMenu();
        }
    }
}
