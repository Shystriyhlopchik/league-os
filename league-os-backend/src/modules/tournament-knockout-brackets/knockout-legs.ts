import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import { MatchStatus } from '../matches/enums/match-status.enum';
import type { BracketRuleV1 } from '../tournament-rules/types/tournament-rules-config.type';
import type { KnockoutMatchPlan } from './types/knockout-bracket.type';
import type { MatchEntity } from '../matches/entities/match.entity';

export function knockoutPredecessorPairs(
  positions: string[],
  pairing: BracketRuleV1['semiFinalPairing'],
): Array<[string, string]> {
  if (
    pairing === 'cross' &&
    positions.length === 4 &&
    positions.every((position, index) => position === `QF-${index + 1}`)
  ) {
    return [
      [positions[0], positions[2]],
      [positions[1], positions[3]],
    ];
  }
  return Array.from({ length: positions.length / 2 }, (_, index) => [
    positions[index * 2],
    positions[index * 2 + 1],
  ]);
}

/** The snapshot and base position identify a tie; suffixes identify its fixtures. */
export function knockoutLeg(position?: string) {
  const match = position?.match(/^((?:QF|SF)-\d+):L([12])$/);
  return match
    ? {
        tiePosition: match[1],
        leg: Number(match[2]) as 1 | 2,
        legs: 2 as const,
      }
    : { tiePosition: position, leg: 1 as const, legs: 1 as const };
}

export function expandKnockoutLegs(
  plans: KnockoutMatchPlan[],
  bracket: BracketRuleV1,
): KnockoutMatchPlan[] {
  return plans
    .flatMap((plan) => {
      const legs =
        plan.roundType === MatchRoundType.QUARTER_FINAL
          ? bracket.quarterFinalLegs
          : plan.roundType === MatchRoundType.SEMI_FINAL
            ? bracket.semiFinalLegs
            : 1;
      if (legs !== 2) return [{ ...plan }];
      return [
        { ...plan, bracketPosition: `${plan.bracketPosition}:L1` },
        {
          ...plan,
          bracketPosition: `${plan.bracketPosition}:L2`,
          homeSource: plan.awaySource,
          awaySource: plan.homeSource,
          resolvedHomeTeamId: plan.resolvedAwayTeamId,
          resolvedAwayTeamId: plan.resolvedHomeTeamId,
        },
      ];
    })
    .map((plan, index) => ({ ...plan, order: index + 1 }));
}

export function knockoutTieSummary(match: MatchEntity, matches: MatchEntity[]) {
  const tie = knockoutLeg(match.bracketPosition);
  if (tie.legs !== 2) return undefined;
  const legs = matches.filter(
    (m) =>
      m.bracketSnapshotId === match.bracketSnapshotId &&
      knockoutLeg(m.bracketPosition).tiePosition === tie.tiePosition,
  );
  const official = legs.filter(
    (m) => m.status === MatchStatus.FINISHED && !!m.resultOfficialAt,
  );
  const home = official.reduce(
    (score, m) =>
      score + (m.homeTeamId === match.homeTeamId ? m.homeScore : m.awayScore),
    0,
  );
  const away = official.reduce(
    (score, m) =>
      score + (m.homeTeamId === match.homeTeamId ? m.awayScore : m.homeScore),
    0,
  );
  const complete = official.length === 2;
  const second = official.find((m) => knockoutLeg(m.bracketPosition).leg === 2);
  const winnerTeamId = !complete
    ? undefined
    : home > away
      ? match.homeTeamId
      : away > home
        ? match.awayTeamId
        : second?.penaltyHomeScore != null &&
            second?.penaltyAwayScore != null &&
            second.penaltyHomeScore !== second.penaltyAwayScore
          ? second.penaltyHomeScore > second.penaltyAwayScore
            ? second.homeTeamId
            : second.awayTeamId
          : undefined;
  return {
    ...tie,
    home,
    away,
    complete,
    completedLegs: official.length,
    winnerTeamId,
  };
}
