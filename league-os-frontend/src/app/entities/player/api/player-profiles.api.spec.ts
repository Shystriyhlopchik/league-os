import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PlayerProfilesApi } from './player-profiles.api';
import { environment } from '../../../../environments/environment';

describe('PlayerProfilesApi', () => {
    let api: PlayerProfilesApi;
    let http: HttpTestingController;
    const base = `${environment.apiUrl}/communities/1/player-profiles`;
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(PlayerProfilesApi);
        http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => http.verify());
    it('scopes manager access by community, player and team', () => {
        api.profile(1, 5, 3).subscribe();
        const r = http.expectOne(
            (req) =>
                req.url === `${base}/5` && req.params.get('teamId') === '3',
        );
        expect(r.request.method).toBe('GET');
        r.flush({});
    });
    it('does not supply a team context for organizer access', () => {
        api.profile(1, 5).subscribe();
        const r = http.expectOne(`${base}/5`);
        expect(r.request.params.has('teamId')).toBeFalse();
        r.flush({});
    });
    it('uploads a photo as multipart with explicit optimistic concurrency value', () => {
        const photo = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
        api.photo(1, 5, photo, '', 3).subscribe();
        const r = http.expectOne(`${base}/5/photo`);
        expect(r.request.body instanceof FormData).toBeTrue();
        expect(r.request.body.get('expectedPhotoUrl')).toBe('');
        expect(r.request.body.get('teamId')).toBe('3');
        expect(r.request.body.get('photo')).toBe(photo);
        r.flush({ photoUrl: '/new.jpg' });
    });
    it('sends review comments, including an eligibility explanation', () => {
        api.review(1, 8, {
            decision: 'approve',
            eligibilityComment: 'Допуск проверен',
        }).subscribe();
        const r = http.expectOne(`${base}/corrections/8/review`);
        expect(r.request.method).toBe('POST');
        expect(r.request.body.eligibilityComment).toBe('Допуск проверен');
        r.flush({});
    });
});
