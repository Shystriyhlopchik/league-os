export interface TournamentValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface TournamentValidationResult {
  valid: boolean;
  errors: TournamentValidationIssue[];
  warnings: TournamentValidationIssue[];
}
