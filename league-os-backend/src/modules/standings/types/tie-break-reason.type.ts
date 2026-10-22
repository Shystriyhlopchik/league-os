export interface TieBreakReason {
  criterion:
    | 'head_to_head'
    | 'wins'
    | 'goal_difference'
    | 'goals_for'
    | 'goals_against'
    | 'disciplinary_score'
    | 'manual_decision'
    | 'draw'
    | 'deterministic_fallback';
  comparedTeamIds: number[];
  value: number | Record<string, number>;
  description: string;
}
