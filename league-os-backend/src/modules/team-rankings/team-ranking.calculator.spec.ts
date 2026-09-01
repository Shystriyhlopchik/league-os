import { TeamRatingResult } from '../tournament-teams/enums/team-rating-result.enum';
import {
  CURRENT_SEASON_WEIGHTS,
  TeamRankingCalculator,
} from './team-ranking.calculator';

describe('TeamRankingCalculator', () => {
  const calculator = new TeamRankingCalculator();

  it('calculates the documented season formula', () => {
    expect(
      calculator.calculate({
        matchesPlayed: 10,
        wins: 6,
        draws: 2,
        result: TeamRatingResult.CHAMPION,
        tournamentTeamCount: 10,
        loyaltyStreak: 3,
      }),
    ).toEqual({
      performancePoints: 20,
      placeBonus: 20,
      tournamentCoefficient: 1.2,
      loyaltyBonus: 4,
      seasonPoints: 52,
    });
  });

  it('normalizes performance instead of rewarding more matches', () => {
    const shortSeason = calculator.calculate({
      matchesPlayed: 4,
      wins: 2,
      draws: 0,
      result: TeamRatingResult.PARTICIPATION,
      tournamentTeamCount: 8,
      loyaltyStreak: 1,
    });
    const longSeason = calculator.calculate({
      matchesPlayed: 8,
      wins: 4,
      draws: 0,
      result: TeamRatingResult.PARTICIPATION,
      tournamentTeamCount: 8,
      loyaltyStreak: 1,
    });

    expect(shortSeason.performancePoints).toBe(15);
    expect(longSeason.performancePoints).toBe(15);
    expect(shortSeason.seasonPoints).toBe(longSeason.seasonPoints);
  });

  it('clamps the tournament coefficient', () => {
    expect(calculator.tournamentCoefficient(1)).toBe(0.9);
    expect(calculator.tournamentCoefficient(10)).toBe(1.2);
    expect(calculator.tournamentCoefficient(20)).toBe(1.3);
  });

  it.each([
    [TeamRatingResult.CHAMPION, 20],
    [TeamRatingResult.FINALIST, 14],
    [TeamRatingResult.THIRD, 10],
    [TeamRatingResult.FOURTH, 7],
    [TeamRatingResult.PLAYOFF, 4],
    [TeamRatingResult.PARTICIPATION, 2],
  ])('uses the non-cumulative place bonus for %s', (result, placeBonus) => {
    expect(
      calculator.calculate({
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        result,
        tournamentTeamCount: 10,
        loyaltyStreak: 1,
      }).placeBonus,
    ).toBe(placeBonus);
  });

  it.each([
    [1, 0],
    [2, 2],
    [3, 4],
    [4, 6],
    [5, 8],
    [8, 8],
  ])('uses the loyalty ladder for a streak of %i', (streak, bonus) => {
    expect(calculator.loyaltyBonus(streak)).toBe(bonus);
  });

  it('keeps the four current-season weights in recency order', () => {
    expect(CURRENT_SEASON_WEIGHTS).toEqual([1, 0.75, 0.5, 0.25]);
  });
});
