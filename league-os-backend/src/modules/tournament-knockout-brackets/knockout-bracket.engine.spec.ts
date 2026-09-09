import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import type { BracketRuleV1 } from '../tournament-rules/types/tournament-rules-config.type';
import { KnockoutBracketEngine } from './knockout-bracket.engine';
import type {
  KnockoutBracketEngineInput,
  KnockoutQualifierInput,
} from './types/knockout-bracket.type';

const qualifier = (
  tournamentTeamId: number,
  sourceGroupId: number,
  qualificationRuleId = 'qualified',
  points = 10 - tournamentTeamId,
): KnockoutQualifierInput => ({
  qualificationEntryId: tournamentTeamId + 100,
  qualificationSnapshotId: 50,
  tournamentTeamId,
  teamId: tournamentTeamId + 1000,
  selectionOrder: tournamentTeamId,
  qualificationRuleId,
  sourceGroupId,
  comparisonSnapshot: {
    points,
    goal_difference: points,
    goals_for: points,
  },
});

const bracketInput = (
  bracket: BracketRuleV1,
  qualifiers: KnockoutQualifierInput[],
  overrides: Partial<KnockoutBracketEngineInput['seedingInput']> = {},
): KnockoutBracketEngineInput => ({
  bracket,
  qualificationSnapshotId: 50,
  qualifiers,
  seedingInput: {
    manualPairs: [],
    drawResults: [],
    ...overrides,
  },
});

describe('KnockoutBracketEngine', () => {
  const engine = new KnockoutBracketEngine();
  const four = [
    qualifier(1, 10),
    qualifier(2, 20),
    qualifier(3, 30),
    qualifier(4, 40),
  ];

  it('builds standard seeding, final and third-place sources', () => {
    const plans = engine.generate(
      bracketInput(
        {
          size: 4,
          placementMatch: 'third_place',
          seeding: {
            type: 'standard',
            ranking: { criteria: ['points'] },
          },
        },
        four,
      ),
    );

    expect(plans).toHaveLength(4);
    expect(
      plans
        .slice(0, 2)
        .map((plan) => [plan.resolvedHomeTeamId, plan.resolvedAwayTeamId]),
    ).toEqual([
      [1001, 1004],
      [1002, 1003],
    ]);
    expect(plans[2]).toEqual(
      expect.objectContaining({
        bracketPosition: 'THIRD_PLACE',
        roundType: MatchRoundType.THIRD_PLACE,
        homeSource: {
          type: 'match_outcome',
          bracketPosition: 'SF-1',
          outcome: 'loser',
        },
      }),
    );
    expect(plans[3]).toEqual(
      expect.objectContaining({
        bracketPosition: 'FINAL',
        roundType: MatchRoundType.FINAL,
        awaySource: {
          type: 'match_outcome',
          bracketPosition: 'SF-2',
          outcome: 'winner',
        },
      }),
    );
  });

  it('creates a deterministic random draw from a saved seed', () => {
    const input = bracketInput(
      { size: 4, seeding: { type: 'random_draw' } },
      four,
      { randomSeed: 42 },
    );

    expect(engine.generate(input)).toEqual(engine.generate(input));
    expect(
      engine
        .generate(input)
        .slice(0, 2)
        .flatMap((plan) => [plan.resolvedHomeTeamId, plan.resolvedAwayTeamId]),
    ).toHaveLength(4);
  });

  it('supports manual pairs with concrete-team sources', () => {
    const plans = engine.generate(
      bracketInput(
        {
          size: 4,
          seeding: {
            type: 'manual',
            constraints: [
              { type: 'avoid_same_source_group', mode: 'required' },
            ],
          },
        },
        four,
        {
          manualPairs: [
            { homeTournamentTeamId: 1, awayTournamentTeamId: 2 },
            { homeTournamentTeamId: 3, awayTournamentTeamId: 4 },
          ],
        },
      ),
    );

    expect(plans[0].homeSource.type).toBe('team');
    expect(plans[0].awaySource.type).toBe('team');
  });

  it('uses organizer pairs even when the published seeding is automatic', () => {
    const plans = engine.generate(
      bracketInput(
        {
          size: 4,
          seeding: {
            type: 'standard',
            ranking: { criteria: ['points'] },
          },
        },
        four,
        {
          manualPairs: [
            { homeTournamentTeamId: 1, awayTournamentTeamId: 2 },
            { homeTournamentTeamId: 4, awayTournamentTeamId: 3 },
          ],
        },
      ),
    );

    expect(
      plans
        .slice(0, 2)
        .map((plan) => [plan.resolvedHomeTeamId, plan.resolvedAwayTeamId]),
    ).toEqual([
      [1001, 1002],
      [1004, 1003],
    ]);
  });

  it.each([
    [10, 2],
    [20, 1],
    [30, 1],
  ])(
    'pairs the best runner-up from group %i with the best available other-group winner',
    (runnerGroupId, expectedWinnerTeamId) => {
      const qualifiers = [
        qualifier(1, 10, 'group-winners', 12),
        qualifier(2, 20, 'group-winners', 10),
        qualifier(3, 30, 'group-winners', 8),
        qualifier(4, runnerGroupId, 'best-second', 9),
      ];
      const plans = engine.generate(
        bracketInput(
          {
            size: 4,
            placementMatch: 'third_place',
            seeding: {
              type: 'best_eligible_opponent',
              protectedQualificationRuleId: 'best-second',
              candidateQualificationRuleId: 'group-winners',
              candidateRanking: {
                criteria: [
                  'points',
                  'goal_difference',
                  'goals_for',
                  'draw_lots',
                ],
              },
              constraints: [
                {
                  type: 'avoid_same_source_group',
                  mode: 'best_effort',
                },
              ],
              remaining: 'pair_in_ranking_order',
            },
          },
          qualifiers,
        ),
      );

      expect(plans[0].resolvedHomeTeamId).toBe(1004);
      expect(plans[0].resolvedAwayTeamId).toBe(expectedWinnerTeamId + 1000);
    },
  );

  it('requires and applies a saved draw when group winners are fully tied', () => {
    const qualifiers = [
      qualifier(1, 10, 'group-winners', 10),
      qualifier(2, 20, 'group-winners', 10),
      qualifier(3, 30, 'group-winners', 10),
      qualifier(4, 40, 'best-second', 9),
    ];
    const bracket: BracketRuleV1 = {
      size: 4,
      seeding: {
        type: 'best_eligible_opponent',
        protectedQualificationRuleId: 'best-second',
        candidateQualificationRuleId: 'group-winners',
        candidateRanking: {
          criteria: ['points', 'goal_difference', 'goals_for', 'draw_lots'],
        },
        constraints: [{ type: 'avoid_same_source_group', mode: 'best_effort' }],
        remaining: 'pair_in_ranking_order',
      },
    };

    expect(() => engine.generate(bracketInput(bracket, qualifiers))).toThrow(
      'A saved draw result is required',
    );

    const plans = engine.generate(
      bracketInput(bracket, qualifiers, {
        drawResults: [
          { tournamentTeamId: 1, rank: 3 },
          { tournamentTeamId: 2, rank: 1 },
          { tournamentTeamId: 3, rank: 2 },
        ],
      }),
    );
    expect(plans[0].resolvedAwayTeamId).toBe(1002);
  });
});
