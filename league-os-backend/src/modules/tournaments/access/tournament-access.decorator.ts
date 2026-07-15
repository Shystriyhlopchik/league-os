import { SetMetadata } from '@nestjs/common';

import { TournamentAccessAction } from './tournament-access-action.enum';

export const TOURNAMENT_ACCESS_KEY = 'tournamentAccessAction';

export const RequireTournamentAccess = (action: TournamentAccessAction) =>
  SetMetadata(TOURNAMENT_ACCESS_KEY, action);
