import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { map, Observable } from 'rxjs';
import { News, NewsAdminPage, SaveNewsRequest } from '../model/news.types';
import { NewsDetailVm } from '../model/news-detail.vm';
import { mapNewsToDetailVm } from '../model/news.mapper';

@Injectable({
    providedIn: 'root',
})
export class NewsApiService {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = environment.apiUrl;

    getLatest(limit: number): Observable<News[]> {
        return this.http.get<News[]>(`${this.apiUrl}/news`, {
            params: {
                limit,
            },
        });
    }

    getPage(page: number, limit: number): Observable<News[]> {
        return this.http.get<News[]>(`${this.apiUrl}/news`, {
            params: {
                page,
                limit,
            },
        });
    }

    getBySlug(slug: string): Observable<NewsDetailVm> {
        return this.http
            .get<News>(`${this.apiUrl}/news/${slug}`)
            .pipe(map(mapNewsToDetailVm));
    }

    getAdminPage(page = 1, limit = 50): Observable<NewsAdminPage> {
        return this.http.get<NewsAdminPage>(`${this.apiUrl}/admin/news`, {
            params: { page, limit },
        });
    }

    getAdminById(newsId: number): Observable<News> {
        return this.http.get<News>(`${this.apiUrl}/admin/news/${newsId}`);
    }

    create(payload: SaveNewsRequest): Observable<News> {
        return this.http.post<News>(`${this.apiUrl}/admin/news`, payload);
    }

    uploadCover(file: File): Observable<{ url: string }> {
        const body = new FormData();
        body.append('cover', file);
        return this.http.post<{ url: string }>(
            `${this.apiUrl}/admin/news/cover`,
            body,
        );
    }

    update(newsId: number, payload: SaveNewsRequest): Observable<News> {
        return this.http.patch<News>(
            `${this.apiUrl}/admin/news/${newsId}`,
            payload,
        );
    }

    publish(newsId: number): Observable<News> {
        return this.http.post<News>(
            `${this.apiUrl}/admin/news/${newsId}/publish`,
            {},
        );
    }

    unpublish(newsId: number): Observable<News> {
        return this.http.post<News>(
            `${this.apiUrl}/admin/news/${newsId}/unpublish`,
            {},
        );
    }

    remove(newsId: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/admin/news/${newsId}`);
    }
}
