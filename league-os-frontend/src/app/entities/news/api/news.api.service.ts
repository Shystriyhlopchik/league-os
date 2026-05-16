import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../../../environments/environment';
import {Observable} from 'rxjs';
import {News} from '../model/news.types';
import {NewsDetailVm} from '../model/news-detail.vm';

@Injectable({
  providedIn: 'root'
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
        return this.http.get<NewsDetailVm>(
            `${this.apiUrl}/news/${slug}`,
        );
    }
}
