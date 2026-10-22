import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TournamentWizardStepperComponent } from './tournament-wizard-stepper.component';

describe('TournamentWizardStepperComponent', () => {
    let fixture: ComponentFixture<TournamentWizardStepperComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TournamentWizardStepperComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(TournamentWizardStepperComponent);
        fixture.componentRef.setInput('steps', [
            { shortTitle: 'Основное', title: 'Основная информация' },
            { shortTitle: 'Этапы', title: 'Формат и этапы' },
        ]);
        fixture.componentRef.setInput('current', 0);
        fixture.detectChanges();
    });

    it('renders steps and emits selected index', () => {
        let selected = -1;
        fixture.componentInstance.selected.subscribe(
            (index) => (selected = index),
        );

        const buttons = fixture.nativeElement.querySelectorAll('button');
        expect(buttons.length).toBe(2);
        buttons[1].click();

        expect(selected).toBe(1);
    });

    it('marks a step with a validation error', () => {
        fixture.componentRef.setInput('errorSteps', [1]);
        fixture.detectChanges();

        const buttons = fixture.nativeElement.querySelectorAll('button');
        expect(
            buttons[1].classList.contains('stepper__item--error'),
        ).toBeTrue();
    });
});
