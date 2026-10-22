import { Component, input, output } from '@angular/core';

export type TournamentWorkflowStep =
    | 'setup'
    | 'registration'
    | 'review'
    | 'preparation'
    | 'launch';

@Component({
    selector: 'app-tournament-workflow',
    standalone: true,
    template: `
        <nav aria-label="Порядок проведения турнира">
            @for (step of steps; track step.id; let i = $index) {
                <button
                    type="button"
                    [attr.aria-current]="current() === step.id ? 'step' : null"
                    [disabled]="
                        busy() || (step.id !== 'setup' && !tournamentId())
                    "
                    (click)="selected.emit(step.id)"
                >
                    <strong>{{ i + 1 }}. {{ step.title }}</strong
                    ><small>{{ step.description }}</small>
                </button>
            }
        </nav>
    `,
    styles: [
        `
            :host {
                display: block;
                margin: 16px 0 24px;
            }
            nav {
                display: grid;
                grid-template-columns: repeat(5, minmax(0, 1fr));
                gap: 8px;
            }
            button {
                text-align: left;
                padding: 14px;
                border: 1px solid #53645c;
                border-radius: 10px;
                background: #203229;
                color: #f4f7f6;
                cursor: pointer;
            }
            button[aria-current] {
                border: 2px solid #72df9c;
            }
            button:disabled {
                opacity: 0.5;
                cursor: default;
            }
            small {
                display: block;
                margin-top: 6px;
                line-height: 1.4;
            }
            @media (max-width: 900px) {
                nav {
                    grid-template-columns: 1fr;
                }
            }
        `,
    ],
})
export class TournamentWorkflowComponent {
    readonly tournamentId = input<number | undefined>();
    readonly current = input<TournamentWorkflowStep>('setup');
    readonly busy = input(false);
    readonly selected = output<TournamentWorkflowStep>();
    readonly steps: {
        id: TournamentWorkflowStep;
        title: string;
        description: string;
    }[] = [
        {
            id: 'setup',
            title: 'Создать турнир',
            description: 'Структура и правила. Команды не нужны.',
        },
        {
            id: 'registration',
            title: 'Открыть приём заявок',
            description: 'Лимиты состава и срок регистрации.',
        },
        {
            id: 'review',
            title: 'Рассмотреть заявки',
            description: 'Утвердить или вернуть с комментарием.',
        },
        {
            id: 'preparation',
            title: 'Подготовить запуск',
            description: 'Группы, пары, даты и площадки.',
        },
        {
            id: 'launch',
            title: 'Запустить турнир',
            description: 'Строгая проверка готовности.',
        },
    ];
}
