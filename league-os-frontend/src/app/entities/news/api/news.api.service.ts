import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../../../environments/environment';
import {Observable} from 'rxjs';
import {News} from '../model/news.types';

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
}
