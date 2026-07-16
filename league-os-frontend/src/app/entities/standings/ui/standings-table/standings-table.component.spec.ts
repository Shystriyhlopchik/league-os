import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StandingsTableComponent } from './standings-table.component';
import { StandingRow } from '../../model/standings-row.model';

describe('StandingsTableComponent', () => {
    let fixture: ComponentFixture<StandingsTableComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [StandingsTableComponent],
        }).compileComponents();
        fixture = TestBed.createComponent(StandingsTableComponent);
    });

    it('uses qualificationStatus instead of the row position', () => {
        const rows: StandingRow[] = [
            row(1, 'Лидер без подтверждённого выхода', 'not_qualified'),
            row(2, 'Подтверждённый участник', 'qualified'),
        ];
        fixture.componentRef.setInput('rows', rows);
        fixture.detectChanges();

        const rendered = Array.from(
            fixture.nativeElement.querySelectorAll('tbody tr:not(.reason-row)'),
        ) as HTMLElement[];
        expect(rendered[0].classList).not.toContain('row--qualified');
        expect(rendered[0].classList).toContain('row--eliminated');
        expect(rendered[1].classList).toContain('row--qualified');
    });

    it('shows the backend tiebreak explanation', () => {
        const item = row(1, 'Команда', 'qualified');
        item.placementReason = {
            type: 'tie_break',
            title: 'Дополнительный критерий',
            description: 'Выше по разнице мячей.',
        };
        fixture.componentRef.setInput('rows', [item]);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
            'Выше по разнице мячей.',
        );
    });
});

function row(
    position: number,
    name: string,
    qualificationStatus: StandingRow['qualificationStatus'],
): StandingRow {
    return {
        position,
        team: { id: position, name, logoUrl: '' },
        played: 4,
        wins: 2,
        draws: 1,
        losses: 1,
        goalsFor: 7,
        goalsAgainst: 4,
        goalDifference: 3,
        points: 7,
        qualificationStatus,
    };
}
