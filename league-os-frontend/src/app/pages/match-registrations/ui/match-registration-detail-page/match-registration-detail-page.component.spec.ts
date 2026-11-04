import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { MatchRegistrationDetailStore } from '../../model/match-registration-detail.store';
import { MatchRegistrationDetailPageComponent } from './match-registration-detail-page.component';

describe('Manual-entry roster candidate refresh', () => {
    let component: MatchRegistrationDetailPageComponent;
    let store: jasmine.SpyObj<MatchRegistrationDetailStore>;

    beforeEach(() => {
        store = jasmine.createSpyObj<MatchRegistrationDetailStore>(
            'MatchRegistrationDetailStore',
            ['load', 'save'],
        );
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: {
                            paramMap: convertToParamMap({
                                matchId: '10',
                                teamId: '20',
                            }),
                        },
                    },
                },
                {
                    provide: Router,
                    useValue: { url: '/dashboard/match-results/10/teams/20' },
                },
                { provide: MatchRegistrationDetailStore, useValue: store },
            ],
        });
        component = TestBed.runInInjectionContext(
            () => new MatchRegistrationDetailPageComponent(),
        );
    });

    it('loads the full candidate list for a referee in manual entry', () => {
        component.ngOnInit();
        expect(store.load).toHaveBeenCalledWith(10, 20, false, true);
    });

    it('refreshes the approved tournament roster when editing starts', () => {
        component.startEditing();
        expect(component.isEditing()).toBeTrue();
        expect(store.load).toHaveBeenCalledWith(10, 20, false, true);
    });

    it('restores the saved selection through the official endpoint on cancel', () => {
        component.isEditing.set(true);
        component.cancelEditing();
        expect(component.isEditing()).toBeFalse();
        expect(store.load).toHaveBeenCalledWith(10, 20, false, true);
    });
});
