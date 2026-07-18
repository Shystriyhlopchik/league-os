import type { TournamentRulesConfig } from '../../tournament-rules/types/tournament-rules-config.type';

const discipline = {
  accumulatedYellows: {
    enabled: true as const,
    threshold: 3,
    suspensionMatches: 1,
    progression: 'every_card_after_threshold' as const,
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
    carryYellowCards: false,
    carryPendingSuspensions: false,
  },
};

export const createYardLeagueRules = (): TournamentRulesConfig => ({
  schemaVersion: 1,
  stages: [
    {
      stageKey: 'groups',
      type: 'group_stage',
      groups: { count: 3, groupSizes: [6, 5, 5] },
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
        periodDurationMinutes: 20,
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
            criteria: ['points', 'goal_difference', 'goals_for', 'draw_lots'],
          },
          constraints: [
            { type: 'avoid_same_source_group', mode: 'best_effort' },
          ],
          remaining: 'pair_in_ranking_order',
        },
      },
      match: {
        periods: 2,
        periodDurationMinutes: 20,
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
          type: 'best_placed_teams_between_groups',
          sourcePosition: 2,
          count: 1,
          ranking: {
            criteria: ['points', 'goal_difference', 'goals_for', 'draw_lots'],
          },
        },
      ],
      crossGroupComparison: {
        unequalGroups: { type: 'exclude_matches_against_last_placed' },
      },
      confirmationRequired: true,
    },
  ],
});
