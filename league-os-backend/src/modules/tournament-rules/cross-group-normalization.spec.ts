import { normalizeCrossGroupStandings } from './cross-group-normalization';

describe('normalizeCrossGroupStandings', () => {
  it('excludes results against the last team only in an oversized group', () => {
    const standings = [
      {
        teamId: 1,
        groupId: 10,
        position: 1,
        played: 5,
        wins: 4,
        draws: 0,
        losses: 1,
        points: 12,
        goalsFor: 10,
        goalsAgainst: 4,
        goalDifference: 6,
      },
      {
        teamId: 2,
        groupId: 10,
        position: 2,
        played: 5,
        wins: 4,
        draws: 0,
        losses: 1,
        points: 12,
        goalsFor: 9,
        goalsAgainst: 4,
        goalDifference: 5,
      },
      {
        teamId: 3,
        groupId: 10,
        position: 3,
        played: 5,
        wins: 2,
        draws: 0,
        losses: 3,
        points: 6,
        goalsFor: 5,
        goalsAgainst: 6,
        goalDifference: -1,
      },
      {
        teamId: 4,
        groupId: 10,
        position: 4,
        played: 5,
        wins: 2,
        draws: 0,
        losses: 3,
        points: 6,
        goalsFor: 4,
        goalsAgainst: 6,
        goalDifference: -2,
      },
      {
        teamId: 5,
        groupId: 10,
        position: 5,
        played: 5,
        wins: 1,
        draws: 0,
        losses: 4,
        points: 3,
        goalsFor: 3,
        goalsAgainst: 8,
        goalDifference: -5,
      },
      {
        teamId: 6,
        groupId: 10,
        position: 6,
        played: 5,
        wins: 0,
        draws: 0,
        losses: 5,
        points: 0,
        goalsFor: 1,
        goalsAgainst: 10,
        goalDifference: -9,
      },
      ...Array.from({ length: 5 }, (_, index) => ({
        teamId: 20 + index,
        groupId: 20,
        position: index + 1,
        played: 4,
        wins: 3,
        draws: 0,
        losses: 1,
        points: 9,
        goalsFor: 7,
        goalsAgainst: 3,
        goalDifference: 4,
      })),
    ];

    const result = normalizeCrossGroupStandings(
      standings,
      [
        {
          id: 100,
          groupId: 10,
          homeTeamId: 2,
          awayTeamId: 6,
          homeScore: 3,
          awayScore: 0,
        },
      ],
      { win: 3, draw: 1, loss: 0 },
      { unequalGroups: { type: 'exclude_matches_against_last_placed' } },
    );

    expect(result.find((row) => row.teamId === 2)).toMatchObject({
      played: 4,
      wins: 3,
      points: 9,
      goalsFor: 6,
      goalsAgainst: 4,
      goalDifference: 2,
      comparisonAdjustment: {
        excludedMatchIds: [100],
        excludedOpponentTeamIds: [6],
      },
    });
    expect(result.find((row) => row.teamId === 20)).toEqual(standings[6]);
  });
});
