import { TestBed } from '@angular/core/testing';
import {
    ActivatedRoute,
    convertToParamMap,
    provideRouter,
} from '@angular/router';
import { of, throwError } from 'rxjs';
import { ClubPlayerComponent } from './club-player.component';
import { TeamPublicApi } from '../../entities/team/api/team-public.api';

describe('ClubPlayerComponent', () => {
    async function setup(fail = false) {
        const profile = {
            team: { id: 2, name: 'Север' },
            communityId: 1,
            player: {
                playerId: 99,
                name: 'Пётр Бывший',
                photoUrl: null,
                position: 'forward',
                shirtNumber: null,
                isCurrent: false,
            },
            totals: {
                matches: 3,
                goals: 5,
                assists: 1,
                yellowCards: 2,
                secondYellowCards: 0,
                redCards: 0,
            },
            seasons: [
                {
                    tournamentId: 3,
                    tournamentName: 'Кубок',
                    seasonName: '2026',
                    matches: 3,
                    goals: 5,
                    assists: 1,
                    yellowCards: 2,
                    redCards: 0,
                },
            ],
        };
        const api = {
            player: jasmine
                .createSpy()
                .and.returnValue(
                    fail ? throwError(() => new Error()) : of(profile),
                ),
        };
        await TestBed.configureTestingModule({
            imports: [ClubPlayerComponent],
            providers: [
                provideRouter([]),
                { provide: TeamPublicApi, useValue: api },
                {
                    provide: ActivatedRoute,
                    useValue: {
                        paramMap: of(
                            convertToParamMap({ teamId: '2', playerId: '99' }),
                        ),
                        queryParamMap: of(
                            convertToParamMap({ communityId: '1' }),
                        ),
                    },
                },
            ],
        }).compileComponents();
        const fixture = TestBed.createComponent(ClubPlayerComponent);
        fixture.detectChanges();
        return { fixture, api, element: fixture.nativeElement as HTMLElement };
    }
    it('shows a former player with team-scoped statistics and tournament breakdown', async () => {
        const { api, element } = await setup();
        expect(api.player).toHaveBeenCalledWith(2, 99, 1);
        expect(element.textContent).toContain('Пётр Бывший');
        expect(element.textContent).toContain('Историческая статистика');
        expect(element.querySelectorAll('tbody tr').length).toBe(1);
    });
    it('provides a visible error and retry when the player cannot be loaded', async () => {
        const { element } = await setup(true);
        expect(element.querySelector('[role="alert"]')).not.toBeNull();
        expect(element.textContent).toContain('Повторить');
    });
});
