import { News } from './news.types';
import { NewsCardVm } from './news-card.vm';

export function mapNewsToCardVm(news: News): NewsCardVm {
    return {
        id: news.id,
        title: news.title,
        date: news.publishedAt,
        imageUrl: news.coverUrl,
        imageAlt: news.title,
        url: `/news/${news.slug}`,
    };
}
