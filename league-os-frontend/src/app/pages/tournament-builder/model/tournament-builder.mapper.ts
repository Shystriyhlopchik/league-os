import {
    MatchRulesDraft,
    TournamentBuilderDraft,
    TournamentRulesConfigV1,
    TournamentStageDraft,
} from './tournament-builder.types';

function matchRules(rules: MatchRulesDraft): Record<string, unknown> {
    return {
        periods: rules.periods,
        periodDurationMinutes: rules.periodDurationMinutes,
        allowDraw: rules.allowDraw,
        extraTime: rules.extraTimeEnabled
            ? {
                  enabled: true,
                  periods: rules.extraTimePeriods,
                  periodDurationMinutes: rules.extraTimePeriodDurationMinutes,
              }
            : { enabled: false },
        penalties: rules.penaltiesEnabled
            ? {
                  enabled: true,
                  initialKicksPerTeam: rules.initialKicksPerTeam,
                  suddenDeath: true,
              }
            : { enabled: false },
    };
}

function discipline(draft: TournamentBuilderDraft): Record<string, unknown> {
    const rules = draft.discipline;
    return {
        accumulatedYellows: rules.accumulatedYellowsEnabled
            ? {
                  enabled: true,
                  threshold: rules.yellowThreshold,
                  suspensionMatches: rules.suspensionMatches,
                  progression: rules.yellowProgression,
              }
            : { enabled: false },
        secondYellowInMatch: rules.secondYellowEnabled
            ? {
                  enabled: true,
                  minimumMatches: rules.secondYellowMinimumMatches,
                  allowManualExtension: rules.allowManualExtension,
              }
            : { enabled: false },
        directRed: rules.directRedEnabled
            ? {
                  enabled: true,
                  minimumMatches: rules.directRedMinimumMatches,
                  allowManualExtension: rules.allowManualExtension,
              }
            : { enabled: false },
        stageTransition: {
            carryYellowCards: rules.carryYellowCards,
            carryPendingSuspensions: rules.carryPendingSuspensions,
        },
    };
}

function tieBreaker(type: string): Record<string, unknown> {
    if (type === 'head_to_head') {
        return {
            type,
            metrics: ['points', 'wins', 'goal_difference', 'goals_for'],
            reapplyAfterReduction: true,
        };
    }
    if (['points', 'wins', 'goal_difference', 'goals_for'].includes(type)) {
        return { type, scope: 'all_matches' };
    }
    if (type === 'goals_against') {
        return { type, scope: 'all_matches', order: 'asc' };
    }
    if (type === 'disciplinary_score' || type === 'technical_loss') {
        return { type, order: 'asc' };
    }
    return { type };
}

function groupSizes(stage: TournamentStageDraft): Record<string, unknown> {
    const capacities = stage.groups.map((group) => group.capacity);
    const equal = capacities.every((capacity) => capacity === capacities[0]);
    return {
        count: stage.groups.length,
        ...(equal
            ? { teamsPerGroup: capacities[0] }
            : { groupSizes: capacities }),
    };
}

function stageRules(
    draft: TournamentBuilderDraft,
    stage: TournamentStageDraft,
): Record<string, unknown> {
    const base = {
        stageKey: stage.key,
        type: stage.type,
        match: matchRules(
            stage.type === 'knockout'
                ? draft.playoffMatchRules
                : draft.groupMatchRules,
        ),
        discipline: discipline(draft),
    };

    if (stage.type === 'knockout') {
        const constraints = draft.playoff.avoidSameSourceGroup
            ? [
                  {
                      type: 'avoid_same_source_group',
                      mode: draft.playoff.constraintMode,
                  },
              ]
            : [];
        const seeding =
            draft.playoff.seeding === 'best_eligible_opponent'
                ? {
                      type: 'best_eligible_opponent',
                      protectedQualificationRuleId: 'best-placed',
                      candidateQualificationRuleId: 'group-winners',
                      candidateRanking: {
                          criteria: draft.playoff.candidateRanking,
                      },
                      constraints,
                      remaining: 'pair_in_ranking_order',
                  }
                : {
                      type: draft.playoff.seeding,
                      ...(draft.playoff.seeding === 'standard'
                          ? {
                                ranking: {
                                    criteria: draft.playoff.candidateRanking,
                                },
                            }
                          : {}),
                      ...(constraints.length ? { constraints } : {}),
                  };
        return {
            ...base,
            bracket: {
                size: stage.bracketSize ?? draft.playoff.bracketSize,
                ...(stage.thirdPlaceMatch || draft.playoff.thirdPlaceMatch
                    ? { placementMatch: 'third_place' }
                    : {}),
                seeding,
            },
        };
    }

    return {
        ...base,
        ...(stage.type === 'group_stage'
            ? {
                  groups: {
                      ...groupSizes(stage),
                  },
              }
            : {}),
        schedule: {
            algorithm: 'circle',
            legs: stage.legs,
            balanceHomeAway: true,
        },
        scoring: { ...draft.scoring },
        standings: {
            tieBreakers: draft.tieBreakers.map(tieBreaker),
        },
    };
}

export function buildTournamentRules(
    draft: TournamentBuilderDraft,
): TournamentRulesConfigV1 {
    const groupStage = draft.stages.find(
        (stage) => stage.type === 'group_stage',
    );
    const knockoutStage = draft.stages.find(
        (stage) => stage.type === 'knockout',
    );
    const transitions: Array<Record<string, unknown>> = [];

    if (draft.qualification.enabled && groupStage && knockoutStage) {
        const qualification: Array<Record<string, unknown>> = [];
        if (draft.qualification.winnersPerGroup === 1) {
            qualification.push({
                id: 'group-winners',
                type: 'group_winners',
            });
        } else {
            qualification.push({
                id: 'top-per-group',
                type: 'top_n_per_group',
                positions: Array.from(
                    { length: draft.qualification.winnersPerGroup },
                    (_, index) => index + 1,
                ),
            });
        }
        if (draft.qualification.bestPlacedCount > 0) {
            qualification.push({
                id: 'best-placed',
                type: 'best_placed_teams_between_groups',
                sourcePosition: draft.qualification.bestPlacedSourcePosition,
                count: draft.qualification.bestPlacedCount,
                ranking: {
                    criteria: draft.qualification.crossGroupCriteria,
                },
            });
        }
        transitions.push({
            fromStageKey: groupStage.key,
            toStageKey: knockoutStage.key,
            qualification,
            ...(draft.qualification.normalizeUnequalGroups
                ? {
                      crossGroupComparison: {
                          unequalGroups: {
                              type: 'exclude_matches_against_last_placed',
                          },
                      },
                  }
                : {}),
            confirmationRequired: true,
        });
    }

    return {
        schemaVersion: 1,
        stages: draft.stages
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((stage) => stageRules(draft, stage)),
        transitions,
    };
}

export function stageConfiguration(
    stage: TournamentStageDraft,
): Record<string, unknown> {
    if (stage.type === 'round_robin') {
        return { schemaVersion: 1, type: stage.type, legs: stage.legs };
    }
    if (stage.type === 'group_stage') {
        const sizes = stage.groups.map((group) => group.capacity);
        const equal = sizes.every((size) => size === sizes[0]);
        return {
            schemaVersion: 1,
            type: stage.type,
            groupsCount: stage.groups.length,
            ...(equal ? { teamsPerGroup: sizes[0] } : { groupSizes: sizes }),
            legs: stage.legs,
        };
    }
    return {
        schemaVersion: 1,
        type: stage.type,
        bracketSize: stage.bracketSize,
        thirdPlaceMatch: Boolean(stage.thirdPlaceMatch),
    };
}
