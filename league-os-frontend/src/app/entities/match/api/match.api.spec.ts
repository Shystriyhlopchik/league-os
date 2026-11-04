import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MatchApi } from './match.api';
import { environment } from '../../../../environments/environment';

describe('MatchApi current community feed', () => {
    let api: MatchApi;
    let http: HttpTestingController;
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(MatchApi);
        http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => http.verify());
    it('requests the site default community without an inferred season or tournament id', () => {
        api.getActiveCommunityMatches().subscribe();
        const request = http.expectOne(
            `${environment.apiUrl}/matches/active-community`,
        );
        expect(request.request.method).toBe('GET');
        expect(request.request.params.keys()).toEqual([]);
        request.flush([]);
    });
    it('passes an explicit community id when requested', () => {
        api.getActiveCommunityMatches(7).subscribe();
        const request = http.expectOne(
            `${environment.apiUrl}/matches/active-community?communityId=7`,
        );
        expect(request.request.params.get('communityId')).toBe('7');
        request.flush([]);
    });
});
