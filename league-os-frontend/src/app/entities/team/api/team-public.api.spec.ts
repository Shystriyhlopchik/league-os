import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TeamPublicApi } from './team-public.api';

describe('TeamPublicApi', () => {
    let api: TeamPublicApi;
    let http: HttpTestingController;
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(TeamPublicApi);
        http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => http.verify());
    it('requests the overview in the selected community', () => {
        api.overview(2, 7).subscribe();
        const req = http.expectOne('/api/teams/2/overview?communityId=7');
        expect(req.request.method).toBe('GET');
        req.flush({});
    });
    it('sends season, calendar year and tournament as independent statistics filters', () => {
        api.statistics(2, 7, {
            seasonId: 1,
            year: 2026,
            tournamentId: 8,
        }).subscribe();
        const req = http.expectOne((r) => r.url === '/api/teams/2/statistics');
        expect(req.request.params.get('communityId')).toBe('7');
        expect(req.request.params.get('seasonId')).toBe('1');
        expect(req.request.params.get('year')).toBe('2026');
        expect(req.request.params.get('tournamentId')).toBe('8');
        req.flush({});
    });
    it('uses the team-scoped player profile endpoint, retaining the community', () => {
        api.player(2, 99, 7).subscribe();
        const req = http.expectOne('/api/teams/2/players/99/profile?communityId=7');
        expect(req.request.method).toBe('GET');
        req.flush({});
    });
});
