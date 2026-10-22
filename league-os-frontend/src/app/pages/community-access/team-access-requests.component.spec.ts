import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import {
    TeamAccessRequest,
    TeamWorkspaceApi,
} from '../../entities/team/api/team-workspace.api';
import { TeamAccessRequestsComponent } from './team-access-requests.component';

describe('TeamAccessRequestsComponent', () => {
    let fixture: ComponentFixture<TeamAccessRequestsComponent>;
    let component: TeamAccessRequestsComponent;
    let api: jasmine.SpyObj<TeamWorkspaceApi>;
    const request: TeamAccessRequest = {
        id: 5,
        teamId: 3,
        teamName: 'Орбита',
        userId: 7,
        username: 'captain',
        name: 'Иван Иванов',
        reason: 'Представляю команду',
    };
    beforeEach(async () => {
        api = jasmine.createSpyObj<TeamWorkspaceApi>('TeamWorkspaceApi', [
            'requests',
            'review',
        ]);
        api.requests.and.returnValue(of([request]));
        api.review.and.returnValue(of({}));
        await TestBed.configureTestingModule({
            imports: [TeamAccessRequestsComponent],
            providers: [{ provide: TeamWorkspaceApi, useValue: api }],
        }).compileComponents();
        fixture = TestBed.createComponent(TeamAccessRequestsComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('communityId', 1);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    });
    it('loads requests for the selected community', () => {
        expect(api.requests).toHaveBeenCalledWith(1);
        expect(fixture.nativeElement.textContent).toContain('Орбита');
    });
    it('requires an individual comment to reject a request', async () => {
        await component.review(request, 'reject');
        expect(api.review).not.toHaveBeenCalled();
        component.comments[request.id] =
            'Не удалось подтвердить связь с командой';
        await component.review(request, 'reject');
        expect(api.review).toHaveBeenCalledWith(
            1,
            5,
            'reject',
            'Не удалось подтвердить связь с командой',
        );
    });
    it('confirms the named user and team before granting access', async () => {
        const confirm = spyOn(window, 'confirm').and.returnValue(false);
        await component.review(request, 'approve');
        expect(confirm.calls.mostRecent().args[0]).toContain('Иван Иванов');
        expect(confirm.calls.mostRecent().args[0]).toContain('Орбита');
        expect(api.review).not.toHaveBeenCalled();
    });
    it('does not render a late response from the previously selected community', async () => {
        const oldResponse = new Subject<TeamAccessRequest[]>();
        api.requests.and.returnValues(oldResponse, of([]));
        const oldLoad = component.load();
        fixture.componentRef.setInput('communityId', 2);
        fixture.detectChanges();
        await fixture.whenStable();
        oldResponse.next([request]);
        oldResponse.complete();
        await oldLoad;
        expect(component.requests()).toEqual([]);
        expect(component.busy()).toBeFalse();
        expect(api.requests).toHaveBeenCalledWith(2);
    });
});
