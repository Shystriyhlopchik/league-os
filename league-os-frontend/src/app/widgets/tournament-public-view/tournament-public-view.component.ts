import {
    Component,
    computed,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import {
    PublicSuspension,
    PublicTournamentStage,
    PublicTournamentView,
} from '../../entities/standings/model/public-tournament-view.model';
import { StandingsTableComponent } from '../../entities/standings/ui/standings-table/standings-table.component';
import { KnockoutBracketComponent } from '../../entities/standings/ui/knockout-bracket/knockout-bracket.component';
import { SessionStore } from '../../entities/user/model/session.store';
import { UserRole } from '../../entities/user/model/user-role.type';
import { FeatureFlagsApi } from '../../shared/api/feature-flags.api';
import { switchMap } from 'rxjs';

@Component({
    selector: 'app-tournament-public-view',
    imports: [StandingsTableComponent, KnockoutBracketComponent],
    templateUrl: './tournament-public-view.component.html',
    styleUrl: './tournament-public-view.component.scss',
})
export class TournamentPublicViewComponent {
    private readonly api = inject(StandingsApi);
    private readonly session = inject(SessionStore);
    private readonly featureFlags = inject(FeatureFlagsApi);
    private readonly reloadToken = signal(0);

    readonly tournamentId = input.required<number | string>();
    readonly compact = input(false);
    readonly loading = signal(true);
    readonly error = signal<string | null>(null);
    readonly view = signal<PublicTournamentView | null>(null);
    readonly selectedStageId = signal<number | null>(null);
    readonly suspensions = signal<PublicSuspension[]>([]);

    readonly currentStage = computed(() => {
        const data = this.view();
        if (!data) return null;
        return (
            data.stages.find(
                (stage) => stage.id === this.selectedStageId(),
            ) ??
            data.stages[0] ??
            null
        );
    });

    readonly canViewSuspensions = computed(() =>
        this.session.hasAnyRole(
            UserRole.SuperAdmin,
            UserRole.Admin,
            UserRole.Referee,
            UserRole.Captain,
        ),
    );

    readonly stageSuspensions = computed(() => {
        const stageId = this.currentStage()?.id;
        return this.suspensions().filter(
            (item) => !item.stageId || item.stageId === stageId,
        );
    });

    constructor() {
        effect((onCleanup) => {
            const tournamentId = this.tournamentId();
            this.reloadToken();
            this.loading.set(true);
            this.error.set(null);
            const subscription = this.featureFlags
                .get()
                .pipe(
                    switchMap((flags) =>
                        flags.multiStagePublicView
                            ? this.api.getPublicTournamentView(tournamentId)
                            : this.api.getLegacyPublicTournamentView(
                                  tournamentId,
                              ),
                    ),
                )
                .subscribe({
                    next: (view) => {
                        this.view.set(view);
                        const selectedStillExists = view.stages.some(
                            (stage) => stage.id === this.selectedStageId(),
                        );
                        if (!selectedStillExists) {
                            this.selectedStageId.set(
                                view.activeStageId ??
                                    view.stages[0]?.id ??
                                    null,
                            );
                        }
                        this.loading.set(false);
                    },
                    error: () => {
                        this.error.set(
                            'Не удалось загрузить данные турнира. Попробуйте ещё раз.',
                        );
                        this.loading.set(false);
                    },
                });
            onCleanup(() => subscription.unsubscribe());
        });

        effect((onCleanup) => {
            const tournamentId = this.tournamentId();
            if (!this.canViewSuspensions()) {
                this.suspensions.set([]);
                return;
            }
            const subscription = this.api
                .getActiveSuspensions(tournamentId)
                .subscribe({
                    next: (rows) => this.suspensions.set(rows),
                    error: () => this.suspensions.set([]),
                });
            onCleanup(() => subscription.unsubscribe());
        });
    }

    selectStage(stage: PublicTournamentStage): void {
        this.selectedStageId.set(stage.id);
    }

    retry(): void {
        this.reloadToken.update((value) => value + 1);
    }

    criterionLabel(criterion: string): string {
        const labels: Record<string, string> = {
            points: 'очки',
            wins: 'победы',
            goal_difference: 'разница мячей',
            goals_for: 'забитые мячи',
            goals_against_asc: 'меньше пропущенных',
            disciplinary_score_asc: 'дисциплинарный рейтинг',
            draw_lots: 'жребий',
        };
        return labels[criterion] ?? criterion;
    }

    suspensionReason(reason: string): string {
        const labels: Record<string, string> = {
            accumulated_yellows: 'накопленные жёлтые карточки',
            second_yellow_card: 'две жёлтые карточки',
            direct_red: 'прямая красная карточка',
            manual: 'решение организатора',
        };
        return labels[reason] ?? reason;
    }
}
