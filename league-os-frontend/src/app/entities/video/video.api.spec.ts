import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { VideoApi } from './video.api';
import { environment } from '../../../environments/environment';

describe('Public video API', () => {
    let api: VideoApi;
    let http: HttpTestingController;
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(VideoApi);
        http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => http.verify());
    it('keeps the home selection endpoint unchanged', () => {
        api.featured().subscribe((videos) => expect(videos).toEqual([]));
        http.expectOne(`${environment.apiUrl}/videos`).flush([]);
    });
    it('requests twelve catalog entries from the selected page', () => {
        const result = { items: [], total: 0, page: 2, limit: 12 };
        api.catalog(2).subscribe((page) => expect(page).toEqual(result));
        const request = http.expectOne(
            (req) => req.url === `${environment.apiUrl}/videos/catalog`,
        );
        expect(request.request.method).toBe('GET');
        expect(request.request.params.get('page')).toBe('2');
        expect(request.request.params.get('limit')).toBe('12');
        request.flush(result);
    });
    it('starts the catalog at the first page by default', () => {
        api.catalog().subscribe();
        const request = http.expectOne(
            (req) => req.url === `${environment.apiUrl}/videos/catalog`,
        );
        expect(request.request.params.get('page')).toBe('1');
        request.flush({ items: [], total: 0, page: 1, limit: 12 });
    });
});
