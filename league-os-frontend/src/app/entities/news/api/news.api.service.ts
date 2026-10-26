import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { map, Observable } from 'rxjs';
import {
    News,
    NewsAdminPage,
    SaveNewsRequest,
    VkConnection,
    NewsPublication,
} from '../model/news.types';
import { Community } from '../../community/community.api';
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

    getAdminPage(
        page = 1,
        limit = 50,
        communityId?: number,
    ): Observable<NewsAdminPage> {
        return this.http.get<NewsAdminPage>(`${this.apiUrl}/admin/news`, {
            params: { page, limit, ...(communityId ? { communityId } : {}) },
        });
    }

    getAdminById(newsId: number): Observable<News> {
        return this.http.get<News>(`${this.apiUrl}/admin/news/${newsId}`);
    }

    create(payload: SaveNewsRequest): Observable<News> {
        return this.http.post<News>(`${this.apiUrl}/admin/news`, payload);
    }

    uploadCover(file: File, communityId?: number): Observable<{ url: string }> {
        const body = new FormData();
        body.append('cover', file);
        return this.http.post<{ url: string }>(
            `${this.apiUrl}/admin/news/cover`,
            body,
            { params: communityId ? { communityId } : {} },
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

    communities() {
        return this.http.get<Community[]>(
            `${this.apiUrl}/admin/news/communities`,
        );
    }

    vkConnection(communityId: number) {
        return this.http.get<VkConnection>(
            `${this.apiUrl}/admin/news/vk-connection`,
            { params: { communityId } },
        );
    }

    checkVkConnection(communityId: number) {
        return this.http.post<VkConnection>(
            `${this.apiUrl}/admin/news/vk-connection/check`,
            {},
            { params: { communityId } },
        );
    }

    vkStatus(id: number) {
        return this.http.get<NewsPublication | null>(
            `${this.apiUrl}/admin/news/${id}/vk`,
        );
    }

    sendVk(id: number) {
        return this.http.post<NewsPublication>(
            `${this.apiUrl}/admin/news/${id}/vk`,
            {},
        );
    }

    retryVk(id: number, confirmedAbsent: boolean) {
        return this.http.post<NewsPublication>(
            `${this.apiUrl}/admin/news/${id}/vk/retry`,
            { confirmedAbsent },
        );
    }
}
