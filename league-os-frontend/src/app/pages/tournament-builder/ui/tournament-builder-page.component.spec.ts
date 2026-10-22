import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import {
    TournamentBuilderApi,
    TournamentBuilderSnapshot,
} from '../api/tournament-builder.api';
import { TournamentApplicationApi } from '../../../entities/tournament-application/tournament-application.api';

import { TournamentBuilderPageComponent } from './tournament-builder-page.component';
import { buildTournamentRules } from '../model/tournament-builder.mapper';
import { stageConfiguration } from '../model/tournament-builder.mapper';

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
                            queryParamMap: convertToParamMap({}),
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
        http.expectOne('/api/communities').flush([]);
        fixture.detectChanges();
    });

    afterEach(() => {
        http.verify();
        localStorage.clear();
    });

    it('separates tournament settings from admission and launch preparation', () => {
        expect(component.steps.length).toBe(10);
        expect(component.visibleSteps().map((s) => s.index)).toEqual([
            0, 1, 4, 5, 6, 7, 8, 9,
        ]);
        expect(component.activeStep()).toBe(0);

        component.goToStep(9);
        fixture.detectChanges();

        expect(component.activeStep()).toBe(9);
        expect(fixture.nativeElement.textContent).toContain(
            'Проверка настроек и создание',
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

    it('previews fourteen matches with separate first and return fixtures', () => {
        component.applyTemplate('groups_playoff');
        component.updatePlayoff('bracketSize', 8);
        component.updatePlayoff('quarterFinalLegs', 2);
        component.updatePlayoff('semiFinalLegs', 2);
        component.updatePlayoff('thirdPlaceMatch', true);
        expect(component.store.previews().bracket.length).toBe(14);
        const preview = component.store.previews().bracket;
        expect(preview[1].position).toBe('QF-1:L2');
        expect(preview[1].home).toBe(preview[0].away);
        expect(preview[8].position).toBe('SF-1:L1');
        expect(preview[13].position).toBe('FINAL');
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

    it('persists the selected routing and previews both semifinal fixtures with the exact sources', () => {
        component.applyTemplate('groups_playoff');
        component.updatePlayoff('bracketSize', 8);
        component.updatePlayoff('semiFinalLegs', 2);
        component.updatePlayoff('semiFinalPairing', 'cross');
        const preview = component.store.previews().bracket;
        expect(preview.find((p) => p.position === 'SF-1:L1')).toEqual({
            position: 'SF-1:L1',
            home: 'Победитель QF-1',
            away: 'Победитель QF-3',
        });
        expect(preview.find((p) => p.position === 'SF-1:L2')).toEqual({
            position: 'SF-1:L2',
            home: 'Победитель QF-3',
            away: 'Победитель QF-1',
        });
        expect(preview.find((p) => p.position === 'SF-2:L1')?.away).toBe(
            'Победитель QF-4',
        );
        const rules = buildTournamentRules(component.draft());
        const knockout = rules.stages.find((s) => s['type'] === 'knockout');
        expect(knockout?.['bracket']).toEqual(
            jasmine.objectContaining({ size: 8, semiFinalPairing: 'cross' }),
        );
    });

    it('resets cross-routing when switching to a four-team bracket and locks it after publication', () => {
        component.applyTemplate('groups_playoff');
        component.updatePlayoff('bracketSize', 8);
        component.updatePlayoff('semiFinalPairing', 'cross');
        component.updatePlayoff('bracketSize', 4);
        expect(component.draft().playoff.semiFinalPairing).toBe('adjacent');
        const rules = buildTournamentRules(component.draft());
        expect(
            rules.stages.find((s) => s['type'] === 'knockout')?.['bracket'],
        ).toEqual(jasmine.objectContaining({ size: 4 }));
        component.store.patch({ lifecycleStatus: 'published' });
        component.updatePlayoff('semiFinalPairing', 'cross');
        expect(component.draft().playoff.semiFinalPairing).toBe('adjacent');
    });

    it('creates the tournament and saves rules on the server without any teams', async () => {
        const api = TestBed.inject(TournamentBuilderApi);
        const router = TestBed.inject(Router);
        spyOn(router, 'navigate').and.resolveTo(true);
        component.applyTemplate('round_robin');
        component.updateDetails('name', 'Новый кубок');
        component.updateDetails('seasonId', 1);
        const snapshot: TournamentBuilderSnapshot = {
            tournament: {
                id: 22,
                name: 'Новый кубок',
                slug: 'novyj-kubok',
                seasonId: 1,
                registrationRequired: true,
                registrationStatus: 'not_open',
                lifecycleStatus: 'draft',
            },
            stages: [],
            tournamentTeams: [],
            ruleVersions: [],
        };
        spyOn(api, 'createTournament').and.returnValue(
            of({
                id: 22,
                lifecycleStatus: 'draft',
                registrationRequired: true,
                registrationStatus: 'not_open',
            }),
        );
        spyOn(api, 'loadBuilder').and.returnValue(of(snapshot));
        spyOn(api, 'createStage').and.returnValue(of({ id: 31 }));
        spyOn(api, 'createRuleVersion').and.returnValue(
            of({ id: 41, version: 1, status: 'draft' }),
        );
        spyOn(api, 'ensureTournamentTeam');
        spyOn(api, 'publish');
        await component.saveDraft();
        expect(api.createTournament).toHaveBeenCalled();
        expect(api.createRuleVersion).toHaveBeenCalled();
        expect(api.ensureTournamentTeam).not.toHaveBeenCalled();
        expect(api.publish).not.toHaveBeenCalled();
        expect(component.draft().participants).toEqual([]);
        expect(component.draft().tournamentId).toBe(22);
        expect(component.store.dirty()).toBeFalse();
        expect(router.navigate).toHaveBeenCalledWith(
            ['/dashboard/tournaments', 22, 'edit'],
            { replaceUrl: true },
        );
    });
    it('uses configuration validation before admission and strict validation only for launch', async () => {
        const api = TestBed.inject(TournamentBuilderApi);
        spyOn(api, 'validate').and.returnValue(of({ valid: true, errors: [] }));
        component.store.patch({ tournamentId: 22 });
        await component.validateTournament();
        expect(api.validate).toHaveBeenCalledWith(
            22,
            jasmine.any(Object),
            'configuration',
        );
        await component.selectWorkflow('launch');
        fixture.detectChanges();
        expect(component.visibleSteps().map((s) => s.index)).toEqual([9]);
        await component.validateTournament('launch');
        expect(api.validate).toHaveBeenCalledWith(
            22,
            jasmine.any(Object),
            'launch',
        );
    });
    it('shows accepted applicants instead of a selectable catalog for new tournaments', () => {
        component.store.patch({
            tournamentId: 22,
            registrationRequired: true,
            participants: [
                { teamId: 7, tournamentTeamId: 70, name: 'Принятая команда' },
            ],
        });
        component.workflowPhase.set('preparation');
        component.goToStep(2);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Принятая команда');
        expect(fixture.nativeElement.textContent).toContain('заявка принята');
        expect(fixture.nativeElement.textContent).not.toContain(
            'Команды выбираются из общего каталога',
        );
        expect(
            fixture.nativeElement.querySelectorAll(
                '.team-card input[type="checkbox"]',
            ).length,
        ).toBe(0);
    });
    it('generates the preparation calendar using the configured number of legs', async () => {
        const api = TestBed.inject(TournamentApplicationApi);
        spyOn(component, 'saveDraft').and.resolveTo();
        spyOn(api, 'generateSchedule').and.returnValue(of({}));
        spyOn(api, 'calendar').and.returnValue(
            of({ stages: [], matches: [], venues: [] }),
        );
        component.store.patch({
            tournamentId: 22,
            registrationRequired: true,
            registrationStatus: 'closed',
        });
        component.store.mutate((d) => {
            d.stages[0].serverId = 31;
            d.stages[0].legs = 2;
        });
        component.store.dirty.set(false);
        component.workflowPhase.set('preparation');
        await component.generateCalendar();
        expect(api.generateSchedule).toHaveBeenCalledWith(22, 31, 2);
        expect(api.calendar).toHaveBeenCalledWith(22);
    });
    it('does not rewrite unchanged stages or participants when saving before launch', async () => {
        const api = TestBed.inject(TournamentBuilderApi);
        component.applyTemplate('round_robin');
        component.updateDetails('name', 'Кубок');
        component.updateDetails('seasonId', 1);
        component.store.patch({
            tournamentId: 22,
            ruleVersionId: 41,
            registrationRequired: true,
            registrationStatus: 'closed',
            participants: [
                {
                    teamId: 7,
                    name: 'Принятая команда',
                    tournamentTeamId: 70,
                    stageParticipantId: 700,
                },
            ],
        });
        component.store.mutate((d) => {
            d.stages[0].serverId = 31;
        });
        const stage = component.draft().stages[0];
        const snapshot: TournamentBuilderSnapshot = {
            tournament: {
                id: 22,
                seasonId: 1,
                name: 'Кубок',
                slug: 'kubok',
                registrationRequired: true,
                registrationStatus: 'closed',
                lifecycleStatus: 'draft',
            },
            tournamentTeams: [
                {
                    id: 70,
                    teamId: 7,
                    team: { id: 7, name: 'Принятая команда' },
                },
            ],
            stages: [
                {
                    id: 31,
                    key: stage.key,
                    name: stage.name,
                    type: stage.type,
                    order: stage.order,
                    configuration: stageConfiguration(stage),
                    groups: [],
                    participants: [
                        {
                            id: 700,
                            tournamentTeamId: 70,
                            tournamentTeam: { id: 70, teamId: 7 },
                        },
                    ],
                },
            ],
            ruleVersions: [],
        };
        spyOn(api, 'updateTournament').and.returnValue(
            of({
                id: 22,
                lifecycleStatus: 'draft',
                registrationRequired: true,
                registrationStatus: 'closed',
            }),
        );
        spyOn(api, 'loadBuilder').and.returnValue(of(snapshot));
        spyOn(api, 'updateRuleVersion').and.returnValue(
            of({ id: 41, version: 1, status: 'draft' }),
        );
        spyOn(api, 'updateStage');
        spyOn(api, 'updateStageParticipant');
        await component.saveDraft();
        expect(component.store.dirty()).toBeFalse();
        expect(api.updateStage).not.toHaveBeenCalled();
        expect(api.updateStageParticipant).not.toHaveBeenCalled();
        expect(api.updateRuleVersion).toHaveBeenCalled();
    });
});
