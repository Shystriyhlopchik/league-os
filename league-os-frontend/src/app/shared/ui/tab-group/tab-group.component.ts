import { Component, input, output } from '@angular/core';
import { TabGroupItem } from './model/tab-group.types';

@Component({
    selector: 'app-tab-group',
    imports: [],
    templateUrl: './tab-group.component.html',
    styleUrl: './tab-group.component.scss',
})
export class TabGroupComponent {
    readonly tabs = input.required<TabGroupItem<any>[]>();
    readonly activeTab = input.required<any>();

    readonly tabChange = output<any>();

    selectTab(tab: TabGroupItem<any>): void {
        if (tab.disabled || tab.value === this.activeTab()) {
            return;
        }

        this.tabChange.emit(tab.value);
    }

    isActive(tab: TabGroupItem<any>): boolean {
        return tab.value === this.activeTab();
    }
}
