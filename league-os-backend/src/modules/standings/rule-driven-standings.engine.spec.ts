import { MatchStatus } from '../matches/enums/match-status.enum';
import { RuleDrivenStandingsEngine } from './rule-driven-standings.engine';
import type { StandingsEngineInput } from './types/standings-engine.type';

const baseInput = (
  overrides: Partial<StandingsEngineInput> = {},
): StandingsEngineInput => ({
  teamIds: [1, 2],
  matches: [],
  scoring: { win: 3, draw: 1, loss: 0 },
  tieBreakers: [{ type: 'draw' }],
  drawRanks: new Map([
    [1, 1],
    [2, 2],
  ]),
  drawSeed: 1,
  ...overrides,
});

describe('RuleDrivenStandingsEngine', () => {
  const engine = new RuleDrivenStandingsEngine();

  it('includes teams without matches and ignores unfinished matches', () => {
    const result = engine.calculate(
      baseInput({
        teamIds: [1, 2, 3],
        matches: [
          {
            homeTeamId: 1,
            awayTeamId: 2,
            homeScore: 9,
            awayScore: 0,
            status: MatchStatus.SCHEDULED,
          },
        ],
        drawRanks: new Map([
          [1, 1],
          [2, 2],
          [3, 3],
        ]),
      }),
    );

    expect(result).toHaveLength(3);
    expect(result.every((row) => row.played === 0 && row.points === 0)).toBe(
      true,
    );
    expect(result.find((row) => row.teamId === 3)).toBeDefined();
  });

  it('uses scoring values from the rule version', () => {
    const result = engine.calculate(
      baseInput({
        scoring: { win: 5, draw: 2, loss: 1 },
        matches: [
          {
            homeTeamId: 1,
            awayTeamId: 2,
            homeScore: 2,
            awayScore: 0,
            status: MatchStatus.FINISHED,
          },
        ],
      }),
    );

    expect(result.map((row) => [row.teamId, row.points])).toEqual([
      [1, 5],
      [2, 1],
    ]);
  });

  it('resolves a three-way tie through a recursively reapplied mini-table', () => {
    const finished = MatchStatus.FINISHED;
    const result = engine.calculate(
      baseInput({
        teamIds: [1, 2, 3, 4],
        matches: [
          {
            homeTeamId: 1,
            awayTeamId: 2,
            homeScore: 3,
            awayScore: 0,
            status: finished,
          },
          {
            homeTeamId: 2,
            awayTeamId: 3,
            homeScore: 2,
            awayScore: 0,
            status: finished,
          },
          {
            homeTeamId: 3,
            awayTeamId: 1,
            homeScore: 1,
            awayScore: 0,
            status: finished,
          },
          {
            homeTeamId: 1,
            awayTeamId: 4,
            homeScore: 1,
            awayScore: 0,
            status: finished,
          },
          {
            homeTeamId: 2,
            awayTeamId: 4,
            homeScore: 1,
            awayScore: 0,
            status: finished,
          },
          {
            homeTeamId: 3,
            awayTeamId: 4,
            homeScore: 1,
            awayScore: 0,
            status: finished,
          },
        ],
        tieBreakers: [
          {
            type: 'head_to_head',
            metrics: ['points', 'goal_difference'],
            reapplyAfterReduction: true,
          },
          { type: 'wins', scope: 'all_matches' },
          { type: 'goal_difference', scope: 'all_matches' },
          { type: 'goals_for', scope: 'all_matches' },
          { type: 'draw' },
        ],
      }),
    );

    expect(result.map((row) => row.teamId)).toEqual([1, 2, 3, 4]);
    expect(result.slice(0, 3).map((row) => row.points)).toEqual([6, 6, 6]);
    expect(
      result
        .slice(0, 3)
        .every((row) => row.tieBreakReason?.criterion === 'head_to_head'),
    ).toBe(true);
    expect(result[1].tieBreakReason?.comparedTeamIds).toEqual([2, 3]);
  });

  it('supports disciplinary score, manual decisions and draw order', () => {
    const disciplinary = engine.calculate(
      baseInput({
        tieBreakers: [
          { type: 'disciplinary_score', order: 'asc' },
          { type: 'manual_decision' },
          { type: 'draw' },
        ],
        disciplinaryEvents: [{ teamId: 1, eventType: 'yellow_card' }],
      }),
    );
    expect(disciplinary.map((row) => row.teamId)).toEqual([2, 1]);
    expect(disciplinary[0].tieBreakReason?.criterion).toBe(
      'disciplinary_score',
    );

    const manual = engine.calculate(
      baseInput({
        tieBreakers: [{ type: 'manual_decision' }, { type: 'draw' }],
        manualDecisionRanks: new Map([
          [1, 2],
          [2, 1],
        ]),
      }),
    );
    expect(manual.map((row) => row.teamId)).toEqual([2, 1]);
    expect(manual[0].tieBreakReason?.criterion).toBe('manual_decision');

    const draw = engine.calculate(
      baseInput({
        drawRanks: new Map([
          [1, 2],
          [2, 1],
        ]),
      }),
    );
    expect(draw.map((row) => row.teamId)).toEqual([2, 1]);
    expect(draw[0].tieBreakReason?.criterion).toBe('draw');
  });

  it('changes the table deterministically after a match result changes', () => {
    const calculate = (homeScore: number, awayScore: number) =>
      engine.calculate(
        baseInput({
          matches: [
            {
              homeTeamId: 1,
              awayTeamId: 2,
              homeScore,
              awayScore,
              status: MatchStatus.FINISHED,
            },
          ],
        }),
      );

    expect(calculate(1, 0).map((row) => row.teamId)).toEqual([1, 2]);
    expect(calculate(0, 1).map((row) => row.teamId)).toEqual([2, 1]);
    expect(calculate(0, 1)).toEqual(calculate(0, 1));
  });

  it('creates a stable unique draw order when draw results are absent', () => {
    const input = baseInput({
      teamIds: [1, 2, 3, 4, 5],
      drawRanks: undefined,
      drawSeed: 42,
    });

    const first = engine.calculate(input);
    const second = engine.calculate(input);

    expect(first).toEqual(second);
    expect(new Set(first.map((row) => row.drawRank)).size).toBe(5);
    expect(first.map((row) => row.position)).toEqual([1, 2, 3, 4, 5]);
  });
});
