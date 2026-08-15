import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, of } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';

import { MatchApi } from '../../entities/match/api/match.api';
import { Match } from '../../entities/match/model/match.types';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import {
    PublicTournamentStage,
    PublicTournamentView,
} from '../../entities/standings/model/public-tournament-view.model';
import { KnockoutBracketComponent } from '../../entities/standings/ui/knockout-bracket/knockout-bracket.component';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { FeatureFlagsApi } from '../../shared/api/feature-flags.api';

export type FormResult = 'win' | 'draw' | 'loss';

@Component({
    selector: 'app-standings-page',
    imports: [KnockoutBracketComponent],
    templateUrl: './standings-page.component.html',
    styleUrl: './standings-page.component.scss',
})
export class StandingsPageComponent implements OnInit {
    readonly defaultTeamLogo = 'images/teams/default-team-logo.png';

    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly standingsApi = inject(StandingsApi);
    private readonly matchApi = inject(MatchApi);
    private readonly featureFlagsApi = inject(FeatureFlagsApi);
    private readonly destroyRef = inject(DestroyRef);

    readonly view = signal<PublicTournamentView | null>(null);
    readonly matches = signal<Match[]>([]);
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    readonly selectedStageKey = signal<string | null>(null);
    readonly selectedGroupId = signal<number | null>(null);

    readonly currentStage = computed<PublicTournamentStage | null>(() => {
        const view = this.view();
        const selectedStageKey = this.selectedStageKey();
        if (!view) return null;

        return (
            view.stages.find(
                (stage) => this.stageKey(stage) === selectedStageKey,
            ) ??
            view.stages[0] ??
            null
        );
    });

    readonly currentGroup = computed<
        PublicTournamentStage['groups'][number] | null
    >(() => {
        const groups = this.currentStage()?.groups ?? [];
        return (
            groups.find((group) => group.id === this.selectedGroupId()) ??
            groups[0] ??
            null
        );
    });

    readonly currentRows = computed(
        () =>
            this.currentGroup()?.standings ??
            this.currentStage()?.standings ??
            [],
    );

    readonly bestSecondRankings = computed(
        () =>
            this.currentStage()?.crossGroupRankings.filter(
                (ranking) => ranking.sourcePosition === 2,
            ) ?? [],
    );

    readonly formByTeam = computed(() => this.buildForm(this.matches()));

    ngOnInit(): void {
        this.loadStandings();
    }

    loadStandings(): void {
        this.loading.set(true);
        this.error.set(null);

        this.tournamentsApi
            .getActiveTournament()
            .pipe(
                switchMap((tournament) => {
                    if (!tournament) {
                        this.view.set(null);
                        this.matches.set([]);
                        this.error.set('Активный турнир не найден.');
                        return EMPTY;
                    }

                    return forkJoin({
                        view: this.featureFlagsApi
                            .get()
                            .pipe(
                                switchMap((flags) =>
                                    flags.multiStagePublicView
                                        ? this.standingsApi.getPublicTournamentView(
                                              tournament.id,
                                          )
                                        : this.standingsApi.getLegacyPublicTournamentView(
                                              tournament.id,
                                          ),
                                ),
                            ),
                        matches: this.matchApi
                            .getByTournament(tournament.id)
                            .pipe(catchError(() => of([] as Match[]))),
                    });
                }),
                tap(({ view, matches }) => {
                    this.view.set(view);
                    this.matches.set(matches);
                    this.syncSelection(view);
                }),
                catchError(() => {
                    this.view.set(null);
                    this.matches.set([]);
                    this.error.set(
                        'Не удалось загрузить турнирную таблицу. Попробуйте ещё раз.',
                    );
                    return EMPTY;
                }),
                finalize(() => this.loading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    selectStage(stage: PublicTournamentStage): void {
        this.selectedStageKey.set(this.stageKey(stage));
        this.selectedGroupId.set(stage.groups[0]?.id ?? null);
    }

    selectGroup(groupId: number): void {
        if (this.currentStage()?.groups.some((group) => group.id === groupId)) {
            this.selectedGroupId.set(groupId);
        }
    }

    stageKey(stage: PublicTournamentStage): string {
        return `${stage.id ?? 'legacy'}:${stage.key}`;
    }

    stageLabel(stage: PublicTournamentStage): string {
        if (stage.type === 'knockout') return 'Плей-офф';
        if (stage.type === 'group_stage') return 'Групповой этап';
        return stage.name;
    }

    form(teamId: number): readonly FormResult[] {
        return this.formByTeam().get(teamId) ?? [];
    }

    formLabel(result: FormResult): string {
        return {
            win: 'Победа',
            draw: 'Ничья',
            loss: 'Поражение',
        }[result];
    }

    qualificationLabel(status: string | undefined): string {
        const labels: Record<string, string> = {
            qualified: 'Выход в плей-офф',
            best_placed: 'Лучшая вторая команда',
            not_qualified: 'Не выходит в плей-офф',
            pending: 'Позиция уточняется',
        };
        return status ? (labels[status] ?? '') : '';
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

    private syncSelection(view: PublicTournamentView): void {
        const selectedStage = view.stages.find(
            (stage) => stage.id === view.activeStageId,
        );
        const stage = selectedStage ?? view.stages[0] ?? null;
        this.selectedStageKey.set(stage ? this.stageKey(stage) : null);
        this.selectedGroupId.set(stage?.groups[0]?.id ?? null);
    }

    private buildForm(matches: readonly Match[]): Map<number, FormResult[]> {
        const form = new Map<number, FormResult[]>();
        const finishedMatches = [...matches]
            .filter(
                (match) =>
                    match.status === 'finished' &&
                    match.score.home !== null &&
                    match.score.away !== null,
            )
            .sort(
                (left, right) =>
                    right.matchDateTime.localeCompare(left.matchDateTime) ||
                    right.id - left.id,
            );

        for (const match of finishedMatches) {
            const homeScore = match.score.home!;
            const awayScore = match.score.away!;
            this.addFormResult(
                form,
                match.homeTeam.id,
                homeScore === awayScore
                    ? 'draw'
                    : homeScore > awayScore
                      ? 'win'
                      : 'loss',
            );
            this.addFormResult(
                form,
                match.awayTeam.id,
                homeScore === awayScore
                    ? 'draw'
                    : awayScore > homeScore
                      ? 'win'
                      : 'loss',
            );
        }

        return form;
    }

    private addFormResult(
        form: Map<number, FormResult[]>,
        teamId: number,
        result: FormResult,
    ): void {
        const results = form.get(teamId) ?? [];
        if (results.length < 5) {
            results.push(result);
            form.set(teamId, results);
        }
    }
}
