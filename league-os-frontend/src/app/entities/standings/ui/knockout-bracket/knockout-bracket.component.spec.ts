import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KnockoutBracketComponent } from './knockout-bracket.component';
import { PublicBracketMatch } from '../../model/public-tournament-view.model';

describe('KnockoutBracketComponent', () => {
    let fixture: ComponentFixture<KnockoutBracketComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [KnockoutBracketComponent],
        }).compileComponents();
        fixture = TestBed.createComponent(KnockoutBracketComponent);
    });

    it('renders adaptive round columns including final and third place', () => {
        fixture.componentRef.setInput('matches', [
            pending('THIRD_PLACE', 'third_place'),
            pending('FINAL', 'final'),
        ]);
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('[data-round="third_place"]'),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('[data-round="final"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain(
            'Участник ещё не определён',
        );
    });

    it('shows penalties and an administrative result marker', () => {
        const match: PublicBracketMatch = {
            ...pending('FINAL', 'final'),
            status: 'finished',
            homeTeam: { id: 1, name: 'А', logoUrl: '' },
            awayTeam: { id: 2, name: 'Б', logoUrl: '' },
            regularTime: { home: 1, away: 1 },
            penalties: { home: 5, away: 4 },
            winnerTeamId: 1,
            administrativeDecision: {
                type: 'technical_result',
                label: 'Технический результат',
            },
        };
        fixture.componentRef.setInput('matches', [match]);
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Пенальти: 5:4');
        expect(fixture.nativeElement.textContent).toContain(
            'Технический результат',
        );
        expect(
            fixture.nativeElement.querySelector('.team--winner')?.textContent,
        ).toContain('А');
    });
});

function pending(
    position: string,
    roundType: PublicBracketMatch['roundType'],
): PublicBracketMatch {
    return {
        position,
        roundType,
        roundNumber: 1,
        status: 'pending',
        homeSourceLabel: 'Участник ещё не определён',
        awaySourceLabel: 'Участник ещё не определён',
    };
}
