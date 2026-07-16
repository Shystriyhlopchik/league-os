import { QualificationEngine } from './qualification.engine';
import type {
  QualificationResolutionInput,
  QualificationStandingInput,
} from './types/qualification-engine.type';

const standing = (
  tournamentTeamId: number,
  groupId: number,
  groupOrder: number,
  position: number,
  overrides: Partial<QualificationStandingInput> = {},
): QualificationStandingInput => ({
  tournamentTeamId,
  teamId: tournamentTeamId + 100,
  groupId,
  groupOrder,
  position,
  points: 10 - position,
  wins: 4 - position,
  goalDifference: 5 - position,
  goalsFor: 8 - position,
  goalsAgainst: position,
  disciplinaryScore: position,
  ...overrides,
});

const groupStandings = [
  standing(1, 10, 1, 1),
  standing(2, 10, 1, 2),
  standing(3, 10, 1, 3),
  standing(4, 20, 2, 1),
  standing(5, 20, 2, 2, { points: 8, goalDifference: 1 }),
  standing(6, 20, 2, 3),
  standing(7, 30, 3, 1),
  standing(8, 30, 3, 2, { points: 7, goalDifference: 9 }),
  standing(9, 30, 3, 3),
];

const emptyResolutions = (): QualificationResolutionInput => ({
  manualSelections: [],
  drawResults: [],
});

describe('QualificationEngine', () => {
  const engine = new QualificationEngine();

  it('supports top_n_per_group', () => {
    const result = engine.calculate({
      standings: groupStandings,
      rules: [{ id: 'top-two', type: 'top_n_per_group', positions: [1, 2] }],
      resolutions: emptyResolutions(),
    });

    expect(result.map((selection) => selection.tournamentTeamId)).toEqual([
      1, 2, 4, 5, 7, 8,
    ]);
  });

  it('supports group_winners', () => {
    const result = engine.calculate({
      standings: groupStandings,
      rules: [{ id: 'winners', type: 'group_winners' }],
      resolutions: emptyResolutions(),
    });

    expect(result.map((selection) => selection.tournamentTeamId)).toEqual([
      1, 4, 7,
    ]);
  });

  it('supports best_placed_teams_between_groups with separate criteria', () => {
    const result = engine.calculate({
      standings: groupStandings,
      rules: [
        {
          id: 'best-second',
          type: 'best_placed_teams_between_groups',
          sourcePosition: 2,
          count: 1,
          ranking: {
            criteria: ['points', 'goal_difference', 'goals_for'],
          },
        },
      ],
      resolutions: emptyResolutions(),
    });

    expect(result[0].tournamentTeamId).toBe(2);
    expect(result[0].reason.criteria).toEqual([
      'points',
      'goal_difference',
      'goals_for',
    ]);
  });

  it('supports overall_ranking without head-to-head', () => {
    const result = engine.calculate({
      standings: groupStandings.map((row) =>
        row.tournamentTeamId === 1
          ? { ...row, points: 12 }
          : row.tournamentTeamId === 4
            ? { ...row, points: 11 }
            : row,
      ),
      rules: [
        {
          id: 'overall',
          type: 'overall_ranking',
          count: 2,
          ranking: { criteria: ['points', 'wins', 'goals_for'] },
        },
      ],
      resolutions: emptyResolutions(),
    });

    expect(result.map((selection) => selection.tournamentTeamId)).toEqual([
      1, 4,
    ]);
  });

  it('supports manual_selection and preserves supplied order', () => {
    const result = engine.calculate({
      standings: groupStandings,
      rules: [{ id: 'wildcards', type: 'manual_selection', count: 2 }],
      resolutions: {
        manualSelections: [
          { qualificationRuleId: 'wildcards', tournamentTeamIds: [8, 3] },
        ],
        drawResults: [],
      },
    });

    expect(result.map((selection) => selection.tournamentTeamId)).toEqual([
      8, 3,
    ]);
  });

  it('uses a saved draw for a complete Yard League tie', () => {
    const tiedSeconds = groupStandings.map((row) =>
      row.position === 2
        ? {
            ...row,
            points: 8,
            goalDifference: 2,
            goalsFor: 7,
          }
        : row,
    );
    const result = engine.calculate({
      standings: tiedSeconds,
      rules: [
        { id: 'winners', type: 'group_winners' },
        {
          id: 'best-second',
          type: 'best_placed_teams_between_groups',
          sourcePosition: 2,
          count: 1,
          ranking: {
            criteria: ['points', 'goal_difference', 'goals_for', 'draw_lots'],
          },
        },
      ],
      resolutions: {
        manualSelections: [],
        drawResults: [
          {
            qualificationRuleId: 'best-second',
            tournamentTeamId: 2,
            rank: 2,
          },
          {
            qualificationRuleId: 'best-second',
            tournamentTeamId: 5,
            rank: 1,
          },
          {
            qualificationRuleId: 'best-second',
            tournamentTeamId: 8,
            rank: 3,
          },
        ],
      },
    });

    expect(result.map((selection) => selection.tournamentTeamId)).toEqual([
      1, 4, 7, 5,
    ]);
    expect(result[3].comparisonSnapshot.draw_lots).toBe(1);
  });

  it('rejects a complete tie without a saved draw result', () => {
    const tiedSeconds = groupStandings.map((row) =>
      row.position === 2
        ? {
            ...row,
            points: 8,
            goalDifference: 2,
            goalsFor: 7,
          }
        : row,
    );

    expect(() =>
      engine.calculate({
        standings: tiedSeconds,
        rules: [
          {
            id: 'best-second',
            type: 'best_placed_teams_between_groups',
            sourcePosition: 2,
            count: 1,
            ranking: {
              criteria: ['points', 'goal_difference', 'goals_for', 'draw_lots'],
            },
          },
        ],
        resolutions: emptyResolutions(),
      }),
    ).toThrow('A saved draw result is required');
  });
});
