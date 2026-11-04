import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatchesSliderComponent } from './matches-slider.component';
import { MatchesSliderStore } from '../model/matches-slider.store';
import { MatchCardVm } from '../../../entities/match/model/match-card.vm';

describe('MatchesSliderComponent community scope', () => {
    let fixture: ComponentFixture<MatchesSliderComponent>;
    let store: {
        matches: ReturnType<typeof signal<MatchCardVm[]>>;
        isLoading: ReturnType<typeof signal<boolean>>;
        isEmpty: ReturnType<typeof signal<boolean>>;
        error: ReturnType<typeof signal<string | null>>;
        loadActiveCommunity: jasmine.Spy;
    };
    beforeEach(async () => {
        store = {
            matches: signal<MatchCardVm[]>([]),
            isLoading: signal(false),
            isEmpty: signal(true),
            error: signal<string | null>(null),
            loadActiveCommunity: jasmine.createSpy(),
        };
        await TestBed.configureTestingModule({
            imports: [MatchesSliderComponent],
            providers: [
                {
                    provide: Router,
                    useValue: { navigate: jasmine.createSpy() },
                },
            ],
        })
            .overrideComponent(MatchesSliderComponent, {
                set: {
                    providers: [
                        { provide: MatchesSliderStore, useValue: store },
                    ],
                },
            })
            .compileComponents();
        fixture = TestBed.createComponent(MatchesSliderComponent);
    });
    it('loads the default community independently of the selected active tournament', () => {
        fixture.detectChanges();
        expect(store.loadActiveCommunity).toHaveBeenCalledWith(undefined);
    });
    it('reloads the feed for an explicitly selected community', () => {
        fixture.componentRef.setInput('communityId', 7);
        fixture.detectChanges();
        expect(store.loadActiveCommunity).toHaveBeenCalledWith(7);
    });
    it('shows the empty current-tournament state instead of old tournament cards', () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
            'Пока нет матчей действующих турниров',
        );
        expect(
            fixture.nativeElement.querySelector('swiper-container'),
        ).toBeNull();
    });
    it('shows loading and error states', () => {
        store.isLoading.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Загрузка матчей');
        store.isLoading.set(false);
        store.error.set('Не удалось загрузить матчи');
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('[role=alert]').textContent,
        ).toContain('Не удалось загрузить матчи');
    });
    it('never passes a negative initial slide when the first game is upcoming or the feed is empty', () => {
        expect(fixture.componentInstance.initialSlideIndex()).toBe(0);
        store.matches.set([{ id: 1, status: 'scheduled' } as MatchCardVm]);
        expect(fixture.componentInstance.initialSlideIndex()).toBe(0);
    });
});
