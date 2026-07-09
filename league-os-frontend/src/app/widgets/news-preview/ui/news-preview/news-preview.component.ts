import { Component, computed, effect, inject, input } from '@angular/core';
import { NewsCardComponent } from '../../../../entities/news/ui/news-card/news-card.component';
import { NewsPreviewStore } from '../../model/news-preview.store';

@Component({
    selector: 'app-news-preview',
    imports: [NewsCardComponent],
    providers: [NewsPreviewStore],
    templateUrl: './news-preview.component.html',
    styleUrl: './news-preview.component.scss',
})
export class NewsPreviewComponent {
    private readonly store = inject(NewsPreviewStore);
    readonly variant = input<'preview' | 'page'>('preview');

    readonly limit = input(5);

    readonly news = this.store.news;
    readonly isLoading = this.store.isLoading;
    readonly isEmpty = this.store.isEmpty;
    readonly error = this.store.error;

    constructor() {
        effect(() => {
            this.store.loadLatest(this.limit());
        });
    }

    loadMore(): void {
        this.store.loadMore(this.limit());
    }
}
