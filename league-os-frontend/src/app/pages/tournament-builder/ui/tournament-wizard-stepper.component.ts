import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';

export interface TournamentWizardStep {
    title: string;
    shortTitle: string;
}

@Component({
    selector: 'app-tournament-wizard-stepper',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <nav class="stepper" aria-label="Шаги создания турнира">
            @for (step of steps(); track $index) {
                <button
                    type="button"
                    class="stepper__item"
                    [class.stepper__item--active]="$index === current()"
                    [class.stepper__item--complete]="$index < current()"
                    [class.stepper__item--error]="errorSteps().includes($index)"
                    (click)="selected.emit($index)"
                >
                    <span class="stepper__number">{{ $index + 1 }}</span>
                    <span class="stepper__label">
                        <strong>{{ step.shortTitle }}</strong>
                        <small>{{ step.title }}</small>
                    </span>
                </button>
            }
        </nav>
    `,
    styles: `
        .stepper { display: grid; gap: 6px; }
        .stepper__item {
            width: 100%; padding: 10px; display: flex; align-items: center;
            gap: 10px; color: #c7cfcd; background: transparent;
            border: 1px solid transparent; border-radius: 10px;
            text-align: left; cursor: pointer;
        }
        .stepper__item:hover { background: #202927; }
        .stepper__item--active { color: #fff; background: #25312e; border-color: #72df9c; }
        .stepper__item--error { border-color: #ff6b76; }
        .stepper__number {
            width: 28px; height: 28px; flex: 0 0 28px; display: grid;
            place-items: center; color: #111; background: #68716f;
            border-radius: 50%; font-weight: 800;
        }
        .stepper__item--active .stepper__number,
        .stepper__item--complete .stepper__number { background: #72df9c; }
        .stepper__item--error .stepper__number { background: #ff6b76; }
        .stepper__label { min-width: 0; display: grid; gap: 2px; }
        .stepper__label strong { font-size: 13px; }
        .stepper__label small { color: #7f8a87; font-size: 10px; line-height: 1.2; }
        @media (max-width: 900px) {
            .stepper { grid-template-columns: repeat(10, minmax(38px, 1fr)); overflow-x: auto; }
            .stepper__item { justify-content: center; padding: 8px 4px; }
            .stepper__label { display: none; }
        }
    `,
})
export class TournamentWizardStepperComponent {
    readonly steps = input.required<TournamentWizardStep[]>();
    readonly current = input.required<number>();
    readonly errorSteps = input<number[]>([]);
    readonly selected = output<number>();
}
