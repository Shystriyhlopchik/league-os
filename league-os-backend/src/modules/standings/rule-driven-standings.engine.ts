import { BadRequestException, Injectable } from '@nestjs/common';

import { MatchStatus } from '../matches/enums/match-status.enum';
import type {
  HeadToHeadMetricV1,
  TieBreakerRuleV1,
} from '../tournament-rules/types/tournament-rules-config.type';
import type { TieBreakReason } from './types/tie-break-reason.type';
import type {
  CalculatedStandingRow,
  StandingsEngineInput,
  StandingsMatchInput,
  StandingsScoringInput,
} from './types/standings-engine.type';

type MutableStandingRow = Omit<CalculatedStandingRow, 'position'>;

interface CriterionEvaluation {
  sortValues: number[];
  displayValue: number | Record<string, number>;
}

interface RankingContext {
  matches: StandingsMatchInput[];
  scoring: StandingsScoringInput;
  manualRanks: Map<number, number>;
  drawRanks: Map<number, number>;
  reasons: Map<number, TieBreakReason>;
}

@Injectable()
export class RuleDrivenStandingsEngine {
  calculate(input: StandingsEngineInput): CalculatedStandingRow[] {
    if (new Set(input.teamIds).size !== input.teamIds.length) {
      throw new BadRequestException('Standing team ids must be unique');
    }
    const drawRanks = new Map(input.drawRanks ?? []);
    const suppliedDrawRanks = input.teamIds
      .filter((teamId) => drawRanks.has(teamId))
      .map((teamId) => drawRanks.get(teamId) as number);
    if (new Set(suppliedDrawRanks).size !== suppliedDrawRanks.length) {
      throw new BadRequestException('Draw ranks must be unique');
    }
    const usedDrawRanks = new Set(suppliedDrawRanks);
    const teamsWithoutDrawRank = input.teamIds
      .filter((teamId) => !drawRanks.has(teamId))
      .sort((left, right) => {
        const difference =
          this.deterministicDrawValue(input.drawSeed, left) -
          this.deterministicDrawValue(input.drawSeed, right);
        return difference || left - right;
      });
    let nextDrawRank = 1;
    teamsWithoutDrawRank.forEach((teamId) => {
      while (usedDrawRanks.has(nextDrawRank)) nextDrawRank += 1;
      drawRanks.set(teamId, nextDrawRank);
      usedDrawRanks.add(nextDrawRank);
    });

    const rows = new Map<number, MutableStandingRow>();
    input.teamIds.forEach((teamId) =>
      rows.set(teamId, this.emptyRow(teamId, input, drawRanks)),
    );
    const finishedMatches = input.matches.filter(
      (match) => match.status === MatchStatus.FINISHED,
    );
    finishedMatches.forEach((match) =>
      this.applyMatch(rows, match, input.scoring),
    );
    this.applyDiscipline(rows, input);

    const criteria: TieBreakerRuleV1[] = [
      { type: 'points', scope: 'all_matches' },
      ...input.tieBreakers.filter((criterion) => criterion.type !== 'points'),
    ];
    const reasons = new Map<number, TieBreakReason>();
    const ranked = this.rankRows([...rows.values()], criteria, 0, {
      matches: finishedMatches,
      scoring: input.scoring,
      manualRanks: input.manualDecisionRanks ?? new Map<number, number>(),
      drawRanks,
      reasons,
    });

    return ranked.map((row, index) => ({
      ...row,
      position: index + 1,
      tieBreakReason: reasons.get(row.teamId),
    }));
  }

  private emptyRow(
    teamId: number,
    input: StandingsEngineInput,
    drawRanks: Map<number, number>,
  ): MutableStandingRow {
    return {
      teamId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      disciplinaryScore: 0,
      manualDecisionRank: input.manualDecisionRanks?.get(teamId),
      drawRank: drawRanks.get(teamId) as number,
    };
  }

  private applyMatch(
    rows: Map<number, MutableStandingRow>,
    match: StandingsMatchInput,
    scoring: StandingsScoringInput,
  ): void {
    const home = rows.get(match.homeTeamId);
    const away = rows.get(match.awayTeamId);
    if (!home || !away) return;

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;
    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;

    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += scoring.win;
      away.points += scoring.loss;
    } else if (match.homeScore < match.awayScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += scoring.win;
      home.points += scoring.loss;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += scoring.draw;
      away.points += scoring.draw;
    }
  }

  private applyDiscipline(
    rows: Map<number, MutableStandingRow>,
    input: StandingsEngineInput,
  ): void {
    const weights = input.disciplinaryWeights ?? {
      yellowCard: 1,
      secondYellowCard: 3,
      redCard: 3,
    };
    input.disciplinaryEvents?.forEach((event) => {
      const row = rows.get(event.teamId);
      if (!row) return;
      if (event.eventType === 'yellow_card') {
        row.disciplinaryScore += weights.yellowCard;
      } else if (event.eventType === 'second_yellow_card') {
        row.disciplinaryScore += weights.secondYellowCard;
      } else {
        row.disciplinaryScore += weights.redCard;
      }
    });
  }

  private rankRows(
    rows: MutableStandingRow[],
    criteria: TieBreakerRuleV1[],
    criterionIndex: number,
    context: RankingContext,
  ): MutableStandingRow[] {
    if (rows.length <= 1) return rows;
    if (criterionIndex >= criteria.length) {
      const comparedTeamIds = rows
        .map((row) => row.teamId)
        .sort((a, b) => a - b);
      rows.forEach((row) =>
        context.reasons.set(row.teamId, {
          criterion: 'deterministic_fallback',
          comparedTeamIds,
          value: row.teamId,
          description:
            'All configured criteria are equal; stable team id order applied',
        }),
      );
      return [...rows].sort((left, right) => left.teamId - right.teamId);
    }

    const criterion = criteria[criterionIndex];
    const evaluations = this.evaluateCriterion(rows, criterion, context);
    const sorted = [...rows].sort((left, right) =>
      this.compareEvaluations(
        evaluations.get(left.teamId) as CriterionEvaluation,
        evaluations.get(right.teamId) as CriterionEvaluation,
      ),
    );
    const partitions = this.partitionByEvaluation(sorted, evaluations);
    if (partitions.length === 1) {
      return this.rankRows(rows, criteria, criterionIndex + 1, context);
    }

    if (criterion.type !== 'points') {
      const comparedTeamIds = rows
        .map((row) => row.teamId)
        .sort((a, b) => a - b);
      rows.forEach((row) => {
        const evaluation = evaluations.get(row.teamId) as CriterionEvaluation;
        context.reasons.set(
          row.teamId,
          this.reasonFor(criterion, comparedTeamIds, evaluation.displayValue),
        );
      });
    }

    return partitions.flatMap((partition) => {
      if (partition.length <= 1) return partition;
      const reapplyHeadToHead =
        criterion.type === 'head_to_head' &&
        criterion.reapplyAfterReduction &&
        partition.length < rows.length;
      return this.rankRows(
        partition,
        criteria,
        reapplyHeadToHead ? criterionIndex : criterionIndex + 1,
        context,
      );
    });
  }

  private evaluateCriterion(
    rows: MutableStandingRow[],
    criterion: TieBreakerRuleV1,
    context: RankingContext,
  ): Map<number, CriterionEvaluation> {
    if (criterion.type === 'head_to_head') {
      const miniTable = this.calculateMiniTable(
        rows,
        context.matches,
        context.scoring,
      );
      return new Map(
        rows.map((row) => {
          const mini = miniTable.get(row.teamId) as MutableStandingRow;
          const displayValue: Record<string, number> = {};
          const sortValues = criterion.metrics.map((metric) => {
            const value = this.metricValue(mini, metric);
            displayValue[metric] = value;
            return value;
          });
          return [row.teamId, { sortValues, displayValue }];
        }),
      );
    }

    return new Map(
      rows.map((row) => {
        const value = this.overallCriterionValue(row, criterion, context);
        const ascending =
          criterion.type === 'goals_against' ||
          criterion.type === 'disciplinary_score' ||
          criterion.type === 'manual_decision' ||
          criterion.type === 'draw' ||
          criterion.type === 'draw_lots' ||
          criterion.type === 'technical_loss';
        return [
          row.teamId,
          {
            sortValues: [ascending ? -value : value],
            displayValue: value,
          },
        ];
      }),
    );
  }

  private calculateMiniTable(
    rows: MutableStandingRow[],
    matches: StandingsMatchInput[],
    scoring: StandingsScoringInput,
  ): Map<number, MutableStandingRow> {
    const teamIds = new Set(rows.map((row) => row.teamId));
    const mini = new Map<number, MutableStandingRow>();
    rows.forEach((row) =>
      mini.set(row.teamId, {
        ...row,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        disciplinaryScore: 0,
      }),
    );
    matches
      .filter(
        (match) =>
          teamIds.has(match.homeTeamId) && teamIds.has(match.awayTeamId),
      )
      .forEach((match) => this.applyMatch(mini, match, scoring));
    return mini;
  }

  private metricValue(
    row: MutableStandingRow,
    metric: HeadToHeadMetricV1,
  ): number {
    if (metric === 'points') return row.points;
    if (metric === 'wins') return row.wins;
    if (metric === 'goal_difference') return row.goalDifference;
    return row.goalsFor;
  }

  private overallCriterionValue(
    row: MutableStandingRow,
    criterion: TieBreakerRuleV1,
    context: RankingContext,
  ): number {
    if (criterion.type === 'points') return row.points;
    if (criterion.type === 'wins') return row.wins;
    if (criterion.type === 'goal_difference') return row.goalDifference;
    if (criterion.type === 'goals_for') return row.goalsFor;
    if (criterion.type === 'goals_against') return row.goalsAgainst;
    if (criterion.type === 'disciplinary_score') return row.disciplinaryScore;
    if (criterion.type === 'manual_decision') {
      return context.manualRanks.get(row.teamId) ?? Number.MAX_SAFE_INTEGER;
    }
    if (criterion.type === 'draw' || criterion.type === 'draw_lots') {
      return context.drawRanks.get(row.teamId) as number;
    }
    return 0;
  }

  private compareEvaluations(
    left: CriterionEvaluation,
    right: CriterionEvaluation,
  ): number {
    const length = Math.max(left.sortValues.length, right.sortValues.length);
    for (let index = 0; index < length; index += 1) {
      const difference =
        (right.sortValues[index] ?? 0) - (left.sortValues[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  }

  private partitionByEvaluation(
    rows: MutableStandingRow[],
    evaluations: Map<number, CriterionEvaluation>,
  ): MutableStandingRow[][] {
    const partitions: MutableStandingRow[][] = [];
    rows.forEach((row) => {
      const current = partitions[partitions.length - 1];
      if (!current) {
        partitions.push([row]);
        return;
      }
      const currentEvaluation = evaluations.get(
        current[0].teamId,
      ) as CriterionEvaluation;
      const rowEvaluation = evaluations.get(row.teamId) as CriterionEvaluation;
      if (this.compareEvaluations(currentEvaluation, rowEvaluation) === 0) {
        current.push(row);
      } else {
        partitions.push([row]);
      }
    });
    return partitions;
  }

  private reasonFor(
    criterion: TieBreakerRuleV1,
    comparedTeamIds: number[],
    value: number | Record<string, number>,
  ): TieBreakReason {
    const type = criterion.type === 'draw_lots' ? 'draw' : criterion.type;
    if (type === 'points' || type === 'technical_loss') {
      throw new BadRequestException('Invalid explanatory tie-break criterion');
    }
    return {
      criterion: type,
      comparedTeamIds,
      value,
      description: `Teams with equal points were ordered by ${type}`,
    };
  }

  private deterministicDrawValue(seed: number, teamId: number): number {
    let value = (seed ^ Math.imul(teamId, 0x45d9f3b)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
    return (value ^ (value >>> 16)) & 0x7fffffff;
  }
}
