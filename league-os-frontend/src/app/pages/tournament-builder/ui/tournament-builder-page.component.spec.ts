import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { TournamentBuilderPageComponent } from './tournament-builder-page.component';

describe('TournamentBuilderPageComponent', () => {
    let fixture: ComponentFixture<TournamentBuilderPageComponent>;
    let component: TournamentBuilderPageComponent;
    let http: HttpTestingController;

    beforeEach(async () => {
        localStorage.clear();
        await TestBed.configureTestingModule({
            imports: [TournamentBuilderPageComponent],
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: {
                            paramMap: convertToParamMap({}),
                        },
                    },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(TournamentBuilderPageComponent);
        component = fixture.componentInstance;
        http = TestBed.inject(HttpTestingController);
        fixture.detectChanges();
        http.expectOne('/api/teams').flush([]);
        fixture.detectChanges();
    });

    afterEach(() => {
        http.verify();
        localStorage.clear();
    });

    it('navigates through all ten steps', () => {
        expect(component.steps.length).toBe(10);
        expect(component.activeStep()).toBe(0);

        component.goToStep(9);
        fixture.detectChanges();

        expect(component.activeStep()).toBe(9);
        expect(fixture.nativeElement.textContent).toContain(
            'Проверка и публикация',
        );
    });

    it('builds the Yard League preview with 35 group matches', () => {
        component.applyTemplate('yard_league');
        fixture.detectChanges();

        const groupStage = component.groupStage();
        expect(groupStage?.groups.length).toBe(3);
        expect(component.expectedTeamCount()).toBe(16);
        expect(component.store.previews().schedule.length).toBe(35);
        expect(
            component.store.previews().bracket.map((item) => item.position),
        ).toEqual(['SF-1', 'SF-2', 'THIRD_PLACE', 'FINAL']);
    });

    it('blocks structural changes after publication', () => {
        component.applyTemplate('yard_league');
        const stagesBefore = component.draft().stages.length;
        component.store.patch({ lifecycleStatus: 'published' });

        component.addStage();
        component.removeStage(component.draft().stages[0].clientKey);

        expect(component.store.structureLocked()).toBeTrue();
        expect(component.draft().stages.length).toBe(stagesBefore);
    });

    it('maps backend validation issues to a field', () => {
        component.store.setIssues([
            {
                path: '$.stages[0].standings.tieBreakers',
                message: 'Добавьте финальный критерий',
            },
        ]);

        expect(component.fieldError('tieBreakers')).toBe(
            'Добавьте финальный критерий',
        );
        expect(component.stepIssueCount(4)).toBe(1);
    });
});
