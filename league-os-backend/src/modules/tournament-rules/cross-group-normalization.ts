import type {
  CrossGroupComparisonRuleV1,
  ScoringRuleV1,
} from './types/tournament-rules-config.type';

export interface CrossGroupStandingStats {
  teamId: number;
  groupId?: number;
  position: number;
  played: number;
  wins: number;
  draws?: number;
  losses?: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface CrossGroupMatchResult {
  id: number;
  groupId?: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
}

export interface CrossGroupComparisonAdjustment {
  policy: 'exclude_matches_against_last_placed';
  excludedMatchIds: number[];
  excludedOpponentTeamIds: number[];
}

export type NormalizedCrossGroupStanding<T extends CrossGroupStandingStats> =
  T & { comparisonAdjustment?: CrossGroupComparisonAdjustment };

export function normalizeCrossGroupStandings<T extends CrossGroupStandingStats>(
  standings: T[],
  matches: CrossGroupMatchResult[],
  scoring: ScoringRuleV1,
  rule?: CrossGroupComparisonRuleV1,
): Array<NormalizedCrossGroupStanding<T>> {
  if (rule?.unequalGroups.type !== 'exclude_matches_against_last_placed') {
    return standings.map((standing) => ({ ...standing }));
  }

  const byGroup = new Map<number, T[]>();
  standings.forEach((standing) => {
    if (!standing.groupId) return;
    const rows = byGroup.get(standing.groupId) ?? [];
    rows.push(standing);
    byGroup.set(standing.groupId, rows);
  });
  if (byGroup.size === 0) {
    return standings.map((standing) => ({ ...standing }));
  }
  const baselineSize = Math.min(
    ...[...byGroup.values()].map((rows) => rows.length),
  );

  return standings.map((standing) => {
    if (!standing.groupId) return { ...standing };
    const groupRows = byGroup.get(standing.groupId) ?? [];
    if (groupRows.length <= baselineSize || standing.position > baselineSize) {
      return { ...standing };
    }
    const excludedOpponentTeamIds = new Set(
      groupRows
        .filter((row) => row.position > baselineSize)
        .map((row) => row.teamId),
    );
    const excludedMatches = matches.filter((match) => {
      if (match.groupId !== standing.groupId) return false;
      const opponentId =
        match.homeTeamId === standing.teamId
          ? match.awayTeamId
          : match.awayTeamId === standing.teamId
            ? match.homeTeamId
            : undefined;
      return (
        opponentId !== undefined && excludedOpponentTeamIds.has(opponentId)
      );
    });
    if (!excludedMatches.length) return { ...standing };

    const normalized: NormalizedCrossGroupStanding<T> = { ...standing };
    excludedMatches.forEach((match) => {
      const isHome = match.homeTeamId === standing.teamId;
      const goalsFor = isHome ? match.homeScore : match.awayScore;
      const goalsAgainst = isHome ? match.awayScore : match.homeScore;
      normalized.played -= 1;
      normalized.goalsFor -= goalsFor;
      normalized.goalsAgainst -= goalsAgainst;
      normalized.goalDifference = normalized.goalsFor - normalized.goalsAgainst;
      if (goalsFor > goalsAgainst) {
        normalized.wins -= 1;
        normalized.points -= scoring.win;
      } else if (goalsFor === goalsAgainst) {
        if (normalized.draws !== undefined) normalized.draws -= 1;
        normalized.points -= scoring.draw;
      } else {
        if (normalized.losses !== undefined) normalized.losses -= 1;
        normalized.points -= scoring.loss;
      }
    });
    normalized.comparisonAdjustment = {
      policy: 'exclude_matches_against_last_placed',
      excludedMatchIds: excludedMatches.map((match) => match.id),
      excludedOpponentTeamIds: [...excludedOpponentTeamIds],
    };
    return normalized;
  });
}
