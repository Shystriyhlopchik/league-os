import { Injectable } from '@nestjs/common';

import { TeamRatingResult } from '../tournament-teams/enums/team-rating-result.enum';

export const PLACE_BONUSES: Readonly<Record<TeamRatingResult, number>> = {
  [TeamRatingResult.CHAMPION]: 20,
  [TeamRatingResult.FINALIST]: 14,
  [TeamRatingResult.THIRD]: 10,
  [TeamRatingResult.FOURTH]: 7,
  [TeamRatingResult.PLAYOFF]: 4,
  [TeamRatingResult.PARTICIPATION]: 2,
};

export const CURRENT_SEASON_WEIGHTS = [1, 0.75, 0.5, 0.25] as const;

export interface SeasonPointsInput {
  matchesPlayed: number;
  wins: number;
  draws: number;
  result: TeamRatingResult;
  tournamentTeamCount: number;
  loyaltyStreak: number;
}

export interface SeasonPointsCalculation {
  performancePoints: number;
  placeBonus: number;
  tournamentCoefficient: number;
  loyaltyBonus: number;
  seasonPoints: number;
}

@Injectable()
export class TeamRankingCalculator {
  calculate(input: SeasonPointsInput): SeasonPointsCalculation {
    const performancePoints = input.matchesPlayed
      ? (30 * (3 * input.wins + input.draws)) / (3 * input.matchesPlayed)
      : 0;
    const placeBonus = PLACE_BONUSES[input.result];
    const tournamentCoefficient = this.tournamentCoefficient(
      input.tournamentTeamCount,
    );
    const loyaltyBonus = this.loyaltyBonus(input.loyaltyStreak);

    return {
      performancePoints: this.round(performancePoints),
      placeBonus,
      tournamentCoefficient,
      loyaltyBonus,
      seasonPoints: this.round(
        (performancePoints + placeBonus) * tournamentCoefficient + loyaltyBonus,
      ),
    };
  }

  tournamentCoefficient(teamCount: number): number {
    return this.round(Math.min(1.3, Math.max(0.9, 0.8 + 0.04 * teamCount)));
  }

  loyaltyBonus(streak: number): number {
    if (streak >= 5) return 8;
    if (streak >= 2) return (streak - 1) * 2;
    return 0;
  }

  round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
