import type { TournamentRulesConfig } from '../../tournament-rules/types/tournament-rules-config.type';

const discipline = {
  accumulatedYellows: {
    enabled: true as const,
    threshold: 2,
    suspensionMatches: 1,
    progression: 'reset_after_suspension' as const,
  },
  secondYellowInMatch: {
    enabled: true as const,
    minimumMatches: 1,
    allowManualExtension: true,
  },
  directRed: {
    enabled: true as const,
    minimumMatches: 1,
    allowManualExtension: true,
  },
  stageTransition: {
    carryYellowCards: true,
    carryPendingSuspensions: true,
  },
};

export const createYardLeagueRules = (): TournamentRulesConfig => ({
  schemaVersion: 1,
  stages: [
    {
      stageKey: 'groups',
      type: 'group_stage',
      groups: { count: 3, teamsPerGroup: 5 },
      schedule: { algorithm: 'circle', legs: 1, balanceHomeAway: true },
      scoring: { win: 3, draw: 1, loss: 0 },
      standings: {
        tieBreakers: [
          {
            type: 'head_to_head',
            metrics: ['points', 'wins', 'goal_difference', 'goals_for'],
            reapplyAfterReduction: true,
          },
          { type: 'wins', scope: 'all_matches' },
          { type: 'goal_difference', scope: 'all_matches' },
          { type: 'goals_for', scope: 'all_matches' },
          { type: 'draw' },
        ],
      },
      match: {
        periods: 2,
        periodDurationMinutes: 25,
        allowDraw: true,
        extraTime: { enabled: false },
        penalties: { enabled: false },
      },
      discipline,
    },
    {
      stageKey: 'playoff',
      type: 'knockout',
      bracket: {
        size: 4,
        placementMatch: 'third_place',
        seeding: {
          type: 'best_eligible_opponent',
          protectedQualificationRuleId: 'best-second',
          candidateQualificationRuleId: 'group-winners',
          candidateRanking: {
            criteria: ['points', 'goal_difference', 'goals_for'],
          },
          constraints: [
            { type: 'avoid_same_source_group', mode: 'best_effort' },
          ],
          remaining: 'pair_in_ranking_order',
        },
      },
      match: {
        periods: 2,
        periodDurationMinutes: 25,
        allowDraw: false,
        extraTime: { enabled: false },
        penalties: {
          enabled: true,
          initialKicksPerTeam: 5,
          suddenDeath: true,
        },
      },
      discipline,
    },
  ],
  transitions: [
    {
      fromStageKey: 'groups',
      toStageKey: 'playoff',
      qualification: [
        { id: 'group-winners', type: 'group_winners' },
        {
          id: 'best-second',
          type: 'best_placed_between_groups',
          sourcePosition: 2,
          count: 1,
          ranking: {
            criteria: ['points', 'goal_difference', 'goals_for'],
          },
        },
      ],
      confirmationRequired: true,
    },
  ],
});
