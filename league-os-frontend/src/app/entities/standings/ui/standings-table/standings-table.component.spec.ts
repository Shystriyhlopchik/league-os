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

    it('renders rows in the position order returned by the backend', () => {
        const rows: StandingRow[] = [
            row(2, 'Вторая команда', 'not_qualified'),
            row(1, 'Первая команда', 'qualified'),
        ];
        fixture.componentRef.setInput('rows', rows);
        fixture.detectChanges();

        const names = Array.from(
            fixture.nativeElement.querySelectorAll(
                '.standings-table__team-name',
            ),
            (element: Element) => element.textContent?.trim(),
        );
        expect(names).toEqual(['Первая команда', 'Вторая команда']);
    });

    it('marks the first, middle and last rows with the new status indicators', () => {
        fixture.componentRef.setInput('rows', [
            row(1, 'Первая команда', 'qualified'),
            row(2, 'Средняя команда', 'not_qualified'),
            row(3, 'Последняя команда', 'not_qualified'),
        ]);
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelectorAll(
                '.standings-table__status--green',
            ).length,
        ).toBe(1);
        expect(
            fixture.nativeElement.querySelectorAll(
                '.standings-table__status--white',
            ).length,
        ).toBe(1);
        expect(
            fixture.nativeElement.querySelectorAll(
                '.standings-table__status--yellow',
            ).length,
        ).toBe(1);
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
