import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CommunityApi } from '../../entities/community/community.api';
import {
    PlayerCorrection,
    PlayerProfilesApi,
} from '../../entities/player/api/player-profiles.api';
import { PlayerProfileReviewPageComponent } from './player-profile-review-page.component';

describe('PlayerProfileReviewPageComponent', () => {
    let fixture: ComponentFixture<PlayerProfileReviewPageComponent>;
    let component: PlayerProfileReviewPageComponent;
    let api: jasmine.SpyObj<PlayerProfilesApi>;
    const identity = {
        firstName: 'Иван',
        lastName: 'Иванов',
        middleName: null,
        birthDate: '2000-01-01',
    };
    const request = {
        id: 8,
        playerId: 5,
        before: identity,
        after: { ...identity, firstName: 'Пётр' },
        reason: 'Опечатка',
        createdAt: '2026-11-04T10:00:00Z',
    } as PlayerCorrection;
    beforeEach(async () => {
        api = jasmine.createSpyObj<PlayerProfilesApi>('PlayerProfilesApi', [
            'requests',
            'search',
            'review',
        ]);
        api.requests.and.returnValue(
            of({ items: [request], total: 1, page: 1, limit: 20 }),
        );
        api.search.and.returnValue(
            of({ items: [], total: 0, page: 1, limit: 20 }),
        );
        api.review.and.returnValue(of({} as PlayerCorrection));
        const communities = {
            list: () =>
                of([
                    {
                        id: 1,
                        name: 'Дворовая лига',
                        canManageTournaments: true,
                    },
                ]),
        };
        await TestBed.configureTestingModule({
            imports: [PlayerProfileReviewPageComponent],
            providers: [
                provideRouter([]),
                { provide: PlayerProfilesApi, useValue: api },
                { provide: CommunityApi, useValue: communities },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(PlayerProfileReviewPageComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    });
    it('shows before and after values and the explanation', () => {
        expect(fixture.nativeElement.textContent).toContain('Иванов Иван');
        expect(fixture.nativeElement.textContent).toContain('Иванов Пётр');
        expect(fixture.nativeElement.textContent).toContain('Опечатка');
    });
    it('requires a comment before returning', async () => {
        await component.decide(request, 'return');
        expect(api.review).not.toHaveBeenCalled();
        expect(component.error()).toContain('комментарий');
    });
    it('returns a correction with a comment', async () => {
        component.comments[8] = 'Уточните имя';
        await component.decide(request, 'return');
        expect(api.review).toHaveBeenCalledWith(
            1,
            8,
            jasmine.objectContaining({
                decision: 'return',
                comment: 'Уточните имя',
            }),
        );
        expect(component.comments[8]).toBeUndefined();
    });
    it('preserves the review explanation after a server rejection', async () => {
        spyOn(window, 'confirm').and.returnValue(true);
        component.eligibility[8] = 'Допуск проверен';
        api.review.and.returnValue(
            throwError(() => ({ error: { message: 'Возможный дубль' } })),
        );
        await component.decide(request, 'approve');
        expect(component.error()).toBe('Возможный дубль');
        expect(component.eligibility[8]).toBe('Допуск проверен');
    });
    it('asks before leaving unsaved review comments', () => {
        component.comments[8] = 'Комментарий';
        spyOn(window, 'confirm').and.returnValue(false);
        expect(component.canLeavePage()).toBeFalse();
    });
});
