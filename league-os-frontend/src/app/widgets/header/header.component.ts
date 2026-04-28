import { Component, computed, signal } from '@angular/core';
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
    readonly isMenuOpen = signal(false);

    readonly menuIconLabel = computed(() =>
        this.isMenuOpen() ? MENU_ICON_LABEL.CLOSE : MENU_ICON_LABEL.OPEN,
    );

    toggleMenu(): void {
        this.isMenuOpen.update((value) => !value);
    }

    closeMenu(): void {
        this.isMenuOpen.set(false);
    }
}
