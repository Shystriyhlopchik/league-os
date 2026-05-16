import {Component, computed, inject, signal} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {NewsApiService} from '../../entities/news/api/news.api.service';
import {NewsDetailVm} from '../../entities/news/model/news-detail.vm';
import {finalize, switchMap} from 'rxjs';
import {DatePipe} from '@angular/common';

@Component({
    selector: 'app-news-detail',
    imports: [DatePipe],
    templateUrl: './news-detail.component.html',
    styleUrl: './news-detail.component.scss',
})
export class NewsDetailComponent {
    private readonly route = inject(ActivatedRoute);
    private readonly newsApi = inject(NewsApiService);

    readonly news = signal<NewsDetailVm | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly hasImage = computed(() => Boolean(this.news()?.imageUrl));

    constructor() {
        this.isLoading.set(true);

        this.route.paramMap
            .pipe(
                switchMap((params) => {
                    const slug = params.get('slug')!;

                    this.isLoading.set(true);
                    this.error.set(null);

                    return this.newsApi.getBySlug(slug).pipe(
                        finalize(() => {
                            this.isLoading.set(false);
                        }),
                    );
                }),
            )
            .subscribe({
                next: (news) => {
                    console.log('NEWS_DETAIL:', news);
                    this.news.set(news);
                },
                error: () => {
                    this.error.set('Не удалось загрузить новость');
                    this.news.set(null);
                },
            });
    }
}
