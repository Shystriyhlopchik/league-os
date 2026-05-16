import { News } from './news.types';
import { NewsCardVm } from './news-card.vm';
import {NewsDetailVm} from './news-detail.vm';

export function mapNewsToCardVm(news: News): NewsCardVm {
    return {
        id: news.id,
        title: news.title,
        slug: news.slug,
        publishedAt: news.publishedAt,
        imageUrl: news.coverUrl,
        imageAlt: news.title,
    };
}

export function mapNewsToDetailVm(news: News): NewsDetailVm {
    return {
        id: news.id,
        title: news.title,
        slug: news.slug,
        content: news.content,
        publishedAt: news.publishedAt,
        imageUrl: news.coverUrl ?? null,
        imageAlt: news.title,
    };
}
