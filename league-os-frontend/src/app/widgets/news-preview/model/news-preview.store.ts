import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { NewsCardVm } from '../../../entities/news/model/news-card.vm';
import { mapNewsToCardVm } from '../../../entities/news/model/news.mapper';
import { NewsApiService } from '../../../entities/news/api/news.api.service';

@Injectable()
export class NewsPreviewStore {
    private readonly newsApi = inject(NewsApiService);

    readonly news = signal<NewsCardVm[]>([]);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);
    readonly page = signal(1);

    readonly isEmpty = computed(() => {
        return !this.isLoading() && this.news().length === 0;
    });

    loadFirstPage(limit: number): void {
        this.page.set(1);
        this.news.set([]);
        this.loadPage(limit);
    }

    loadMore(limit: number): void {
        this.page.update((page) => page + 1);
        this.loadPage(limit);
    }

    private loadPage(limit: number): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.newsApi
            .getPage(this.page(), limit)
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (news) => {
                    const newItems = news.map(mapNewsToCardVm);

                    this.news.update((current) => [...current, ...newItems]);
                },
                error: () => {
                    this.error.set('Не удалось загрузить новости');
                },
            });
    }

    loadLatest(limit: number): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.newsApi
            .getLatest(limit)
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (news) => {
                    this.news.set(news.map(mapNewsToCardVm));
                },
                error: () => {
                    this.news.set([]);
                    this.error.set('Не удалось загрузить новости');
                },
            });
    }
}
