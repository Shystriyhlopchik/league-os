import { RoundRobinGenerator } from './round-robin-generator';

const unorderedPairKey = (left: number, right: number) =>
  [left, right].sort((a, b) => a - b).join(':');

describe('RoundRobinGenerator', () => {
  const generator = new RoundRobinGenerator();

  it.each([
    { teams: 4, rounds: 3, matches: 6 },
    { teams: 5, rounds: 5, matches: 10 },
    { teams: 6, rounds: 5, matches: 15 },
  ])(
    'creates every pair once for $teams teams',
    ({ teams, rounds, matches }) => {
      const result = generator.generate(
        Array.from({ length: teams }, (_, index) => index + 1),
        1,
      );
      const pairs = result.flatMap((round) => round.pairs);
      const uniquePairs = new Set(
        pairs.map((pair) => unorderedPairKey(pair.homeTeamId, pair.awayTeamId)),
      );

      expect(result).toHaveLength(rounds);
      expect(pairs).toHaveLength(matches);
      expect(uniquePairs.size).toBe(matches);
    },
  );

  it('creates one explicit bye per team for an odd-sized group', () => {
    const result = generator.generate([1, 2, 3, 4, 5], 1);

    expect(result.every((round) => round.pairs.length === 2)).toBe(true);
    expect(result.map((round) => round.byeTeamId).sort()).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('supports multiple legs and reverses home and away in the second leg', () => {
    const result = generator.generate([1, 2, 3, 4], 2);
    const firstLeg = result.slice(0, 3).flatMap((round) => round.pairs);
    const secondLeg = result.slice(3).flatMap((round) => round.pairs);

    expect(result).toHaveLength(6);
    expect(firstLeg).toHaveLength(6);
    expect(secondLeg).toEqual(
      firstLeg.map((pair) => ({
        homeTeamId: pair.awayTeamId,
        awayTeamId: pair.homeTeamId,
      })),
    );
    expect(result.map((round) => round.roundNumber)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});
