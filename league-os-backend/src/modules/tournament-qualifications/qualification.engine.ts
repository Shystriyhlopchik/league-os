import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import type {
  CrossGroupCriterionV1,
  CrossGroupRankingRuleV1,
  QualificationRuleV1,
} from '../tournament-rules/types/tournament-rules-config.type';
import type {
  QualificationEngineInput,
  QualificationResolutionInput,
  QualificationSelection,
  QualificationStandingInput,
} from './types/qualification-engine.type';

export class QualificationDrawRequiredException extends ConflictException {
  constructor(qualificationRuleId: string, tournamentTeamIds: number[]) {
    super({
      code: 'QUALIFICATION_DRAW_REQUIRED',
      message: 'A saved draw result is required to resolve qualification',
      qualificationRuleId,
      tournamentTeamIds: [...tournamentTeamIds].sort((a, b) => a - b),
    });
  }
}

@Injectable()
export class QualificationEngine {
  calculate(input: QualificationEngineInput): QualificationSelection[] {
    this.assertInput(input);
    const selected = new Set<number>();
    const result: QualificationSelection[] = [];
    const manualSelections = new Map(
      input.resolutions.manualSelections.map((selection) => [
        selection.qualificationRuleId,
        selection.tournamentTeamIds,
      ]),
    );
    const drawResults = this.buildDrawResults(input.resolutions);

    input.rules.forEach((rule) => {
      if (rule.type === 'group_winners') {
        this.groupRows(input.standings).forEach((rows) =>
          this.appendSelection(
            result,
            selected,
            this.rowAtPosition(rows, 1, rule.id),
            rule,
          ),
        );
        return;
      }

      if (rule.type === 'top_n_per_group') {
        this.groupRows(input.standings).forEach((rows) =>
          rule.positions.forEach((position) =>
            this.appendSelection(
              result,
              selected,
              this.rowAtPosition(rows, position, rule.id),
              rule,
            ),
          ),
        );
        return;
      }

      if (
        rule.type === 'best_placed_teams_between_groups' ||
        rule.type === 'best_placed_between_groups'
      ) {
        const candidates = input.standings.filter(
          (standing) =>
            standing.position === rule.sourcePosition &&
            !selected.has(standing.tournamentTeamId),
        );
        this.appendRanked(
          result,
          selected,
          candidates,
          rule,
          rule.count,
          rule.ranking,
          drawResults.get(rule.id),
        );
        return;
      }

      if (rule.type === 'overall_ranking') {
        this.appendRanked(
          result,
          selected,
          input.standings.filter(
            (standing) => !selected.has(standing.tournamentTeamId),
          ),
          rule,
          rule.count,
          rule.ranking,
          drawResults.get(rule.id),
        );
        return;
      }

      const selectedIds = manualSelections.get(rule.id);
      if (!selectedIds || selectedIds.length !== rule.count) {
        throw new BadRequestException(
          `Manual rule ${rule.id} requires exactly ${rule.count} teams`,
        );
      }
      selectedIds.forEach((tournamentTeamId) => {
        const standing = input.standings.find(
          (candidate) => candidate.tournamentTeamId === tournamentTeamId,
        );
        if (!standing) {
          throw new BadRequestException(
            `Manual team ${tournamentTeamId} is outside the source stage`,
          );
        }
        this.appendSelection(result, selected, standing, rule);
      });
    });

    return result;
  }

  private appendRanked(
    result: QualificationSelection[],
    selected: Set<number>,
    candidates: QualificationStandingInput[],
    rule: QualificationRuleV1,
    count: number,
    ranking: CrossGroupRankingRuleV1,
    drawResults: Map<number, number> | undefined,
  ): void {
    if (candidates.length < count) {
      throw new ConflictException(
        `Qualification rule ${rule.id} needs ${count} candidates, but only ${candidates.length} are available`,
      );
    }
    const ranked = this.rankForSelection(
      candidates,
      count,
      ranking.criteria,
      rule.id,
      drawResults,
    );
    ranked
      .slice(0, count)
      .forEach((standing) =>
        this.appendSelection(
          result,
          selected,
          standing,
          rule,
          ranking.criteria,
          drawResults?.get(standing.tournamentTeamId),
        ),
      );
  }

  private appendSelection(
    result: QualificationSelection[],
    selected: Set<number>,
    standing: QualificationStandingInput,
    rule: QualificationRuleV1,
    criteria?: CrossGroupCriterionV1[],
    drawRank?: number,
  ): void {
    if (selected.has(standing.tournamentTeamId)) {
      throw new ConflictException(
        `Team ${standing.tournamentTeamId} is selected by more than one qualification rule`,
      );
    }
    selected.add(standing.tournamentTeamId);
    result.push({
      tournamentTeamId: standing.tournamentTeamId,
      teamId: standing.teamId,
      sourceGroupId: standing.groupId,
      sourcePosition: standing.position,
      qualificationRuleId: rule.id,
      selectionOrder: result.length + 1,
      comparisonSnapshot: {
        ...this.comparisonSnapshot(standing),
        ...(drawRank === undefined ? {} : { draw_lots: drawRank }),
      },
      reason: {
        strategy: rule.type,
        criteria,
        values: criteria
          ? Object.fromEntries(
              criteria.map((criterion) => [
                criterion,
                criterion === 'draw_lots'
                  ? (drawRank ?? 0)
                  : this.criterionValue(standing, criterion),
              ]),
            )
          : undefined,
        description: `Selected by qualification rule ${rule.id}`,
      },
    });
  }

  private rankForSelection(
    candidates: QualificationStandingInput[],
    count: number,
    criteria: CrossGroupCriterionV1[],
    qualificationRuleId: string,
    drawResults: Map<number, number> | undefined,
  ): QualificationStandingInput[] {
    const statisticalCriteria = criteria.filter(
      (criterion) => criterion !== 'draw_lots',
    );
    const sorted = [...candidates].sort((left, right) => {
      const comparison = this.compare(left, right, statisticalCriteria);
      return comparison || left.tournamentTeamId - right.tournamentTeamId;
    });
    const partitions: QualificationStandingInput[][] = [];
    sorted.forEach((candidate) => {
      const current = partitions[partitions.length - 1];
      if (
        !current ||
        this.compare(current[0], candidate, statisticalCriteria) !== 0
      ) {
        partitions.push([candidate]);
      } else {
        current.push(candidate);
      }
    });

    let offset = 0;
    const ranked: QualificationStandingInput[] = [];
    partitions.forEach((partition) => {
      const crossesSelectionBoundary =
        offset < count && offset + partition.length > count;
      if (crossesSelectionBoundary) {
        if (!criteria.includes('draw_lots')) {
          throw new ConflictException({
            code: 'QUALIFICATION_TIE_UNRESOLVED',
            message:
              'Cross-group criteria do not resolve the qualification boundary',
            qualificationRuleId,
            tournamentTeamIds: partition.map(
              (candidate) => candidate.tournamentTeamId,
            ),
          });
        }
        this.assertDrawResults(qualificationRuleId, partition, drawResults);
        partition.sort(
          (left, right) =>
            (drawResults?.get(left.tournamentTeamId) as number) -
              (drawResults?.get(right.tournamentTeamId) as number) ||
            left.tournamentTeamId - right.tournamentTeamId,
        );
      }
      ranked.push(...partition);
      offset += partition.length;
    });
    return ranked;
  }

  private assertDrawResults(
    qualificationRuleId: string,
    candidates: QualificationStandingInput[],
    drawResults: Map<number, number> | undefined,
  ): void {
    const missing = candidates.filter(
      (candidate) => !drawResults?.has(candidate.tournamentTeamId),
    );
    const ranks = candidates
      .map((candidate) => drawResults?.get(candidate.tournamentTeamId))
      .filter((rank): rank is number => rank !== undefined);
    if (missing.length > 0 || new Set(ranks).size !== candidates.length) {
      throw new QualificationDrawRequiredException(
        qualificationRuleId,
        candidates.map((candidate) => candidate.tournamentTeamId),
      );
    }
  }

  private compare(
    left: QualificationStandingInput,
    right: QualificationStandingInput,
    criteria: CrossGroupCriterionV1[],
  ): number {
    for (const criterion of criteria) {
      const leftValue = this.criterionValue(left, criterion);
      const rightValue = this.criterionValue(right, criterion);
      const ascending =
        criterion === 'goals_against_asc' ||
        criterion === 'disciplinary_score_asc';
      const difference = ascending
        ? leftValue - rightValue
        : rightValue - leftValue;
      if (difference !== 0) return difference;
    }
    return 0;
  }

  private criterionValue(
    standing: QualificationStandingInput,
    criterion: CrossGroupCriterionV1,
  ): number {
    if (criterion === 'points') return standing.points;
    if (criterion === 'wins') return standing.wins;
    if (criterion === 'goal_difference') return standing.goalDifference;
    if (criterion === 'goals_for') return standing.goalsFor;
    if (criterion === 'goals_against_asc') return standing.goalsAgainst;
    if (criterion === 'disciplinary_score_asc') {
      return standing.disciplinaryScore;
    }
    return 0;
  }

  private comparisonSnapshot(
    standing: QualificationStandingInput,
  ): Record<string, number> {
    return {
      points: standing.points,
      wins: standing.wins,
      goal_difference: standing.goalDifference,
      goals_for: standing.goalsFor,
      goals_against: standing.goalsAgainst,
      disciplinary_score: standing.disciplinaryScore,
    };
  }

  private groupRows(
    standings: QualificationStandingInput[],
  ): QualificationStandingInput[][] {
    if (standings.some((standing) => standing.groupId === undefined)) {
      throw new BadRequestException(
        'Group qualification requires every standing row to have a group',
      );
    }
    const grouped = new Map<number, QualificationStandingInput[]>();
    standings.forEach((standing) => {
      const groupId = standing.groupId as number;
      grouped.set(groupId, [...(grouped.get(groupId) ?? []), standing]);
    });
    return [...grouped.values()]
      .sort(
        (left, right) =>
          left[0].groupOrder - right[0].groupOrder ||
          (left[0].groupId as number) - (right[0].groupId as number),
      )
      .map((rows) => [...rows].sort((a, b) => a.position - b.position));
  }

  private rowAtPosition(
    rows: QualificationStandingInput[],
    position: number,
    qualificationRuleId: string,
  ): QualificationStandingInput {
    const row = rows.find((candidate) => candidate.position === position);
    if (!row) {
      throw new ConflictException(
        `Qualification rule ${qualificationRuleId} cannot find position ${position} in group ${String(rows[0]?.groupId)}`,
      );
    }
    return row;
  }

  private buildDrawResults(
    resolutions: QualificationResolutionInput,
  ): Map<string, Map<number, number>> {
    const result = new Map<string, Map<number, number>>();
    resolutions.drawResults.forEach((draw) => {
      const byTeam =
        result.get(draw.qualificationRuleId) ?? new Map<number, number>();
      if (byTeam.has(draw.tournamentTeamId)) {
        throw new BadRequestException('Draw teams must be unique per rule');
      }
      byTeam.set(draw.tournamentTeamId, draw.rank);
      result.set(draw.qualificationRuleId, byTeam);
    });
    result.forEach((byTeam) => {
      const ranks = [...byTeam.values()];
      if (new Set(ranks).size !== ranks.length) {
        throw new BadRequestException('Draw ranks must be unique per rule');
      }
    });
    return result;
  }

  private assertInput(input: QualificationEngineInput): void {
    const teamIds = input.standings.map(
      (standing) => standing.tournamentTeamId,
    );
    if (new Set(teamIds).size !== teamIds.length) {
      throw new BadRequestException('Qualification standings must be unique');
    }
    const ruleIds = input.rules.map((rule) => rule.id);
    if (new Set(ruleIds).size !== ruleIds.length) {
      throw new BadRequestException('Qualification rule ids must be unique');
    }
    const manualRuleIds = input.resolutions.manualSelections.map(
      (selection) => selection.qualificationRuleId,
    );
    if (new Set(manualRuleIds).size !== manualRuleIds.length) {
      throw new BadRequestException(
        'Manual selections must be unique per rule',
      );
    }
    const rulesById = new Map(input.rules.map((rule) => [rule.id, rule]));
    input.resolutions.manualSelections.forEach((selection) => {
      const rule = rulesById.get(selection.qualificationRuleId);
      if (!rule || rule.type !== 'manual_selection') {
        throw new BadRequestException(
          `Manual selection references incompatible rule ${selection.qualificationRuleId}`,
        );
      }
    });
    input.resolutions.drawResults.forEach((draw) => {
      const rule = rulesById.get(draw.qualificationRuleId);
      const supportsDraw =
        rule?.type === 'overall_ranking' ||
        rule?.type === 'best_placed_teams_between_groups' ||
        rule?.type === 'best_placed_between_groups';
      if (!supportsDraw || !rule.ranking.criteria.includes('draw_lots')) {
        throw new BadRequestException(
          `Draw result references incompatible rule ${draw.qualificationRuleId}`,
        );
      }
    });
  }
}
