import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerLeaderboardEntry } from '../../entities/tournaments/model/player-leader.types';
import { PlayerLeadersCardComponent } from './player-leaders-card.component';

describe('PlayerLeadersCardComponent', () => {
    let fixture: ComponentFixture<PlayerLeadersCardComponent>;

    const leaders: PlayerLeaderboardEntry[] = [
        {
            position: 1,
            value: 10,
            player: { id: 1, name: 'Дима Степанов', photoUrl: null },
            team: { id: 1, name: 'Сутра', logoUrl: null },
        },
        {
            position: 2,
            value: 9,
            player: { id: 2, name: 'Александр Орлов', photoUrl: null },
            team: { id: 2, name: 'Файр', logoUrl: null },
        },
        {
            position: 3,
            value: 8,
            player: { id: 3, name: 'Андрей Илларионов', photoUrl: null },
            team: { id: 3, name: 'Сарбаки', logoUrl: null },
        },
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PlayerLeadersCardComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(PlayerLeadersCardComponent);
    });

    it('renders the top three received from the parent', () => {
        fixture.componentRef.setInput('leaders', leaders);
        fixture.detectChanges();

        const values = Array.from(
            fixture.nativeElement.querySelectorAll('.leaders-card__value'),
            (element: Element) => element.textContent?.trim(),
        );

        expect(values).toEqual(['10', '9', '8']);
        expect(fixture.nativeElement.textContent).toContain('Дима Степанов');
    });

    it('renders the combined and average metric titles', () => {
        fixture.componentRef.setInput('metric', 'goalContributions');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Гол + пас');

        fixture.componentRef.setInput('metric', 'goalsPerGame');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
            'Среднее голов за игру',
        );
    });
});
