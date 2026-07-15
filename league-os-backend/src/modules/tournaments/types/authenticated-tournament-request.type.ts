import type { Request } from 'express';

export interface AuthenticatedTournamentUser {
  id: number;
  roles?: string[];
}

export interface AuthenticatedTournamentRequest extends Request {
  user: AuthenticatedTournamentUser;
}
