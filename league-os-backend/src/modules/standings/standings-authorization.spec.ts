import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StandingsController } from './standings.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TournamentAccessGuard } from '../tournaments/access/tournament-access.guard';
import { TOURNAMENT_ACCESS_KEY } from '../tournaments/access/tournament-access.decorator';
import { TournamentAccessAction } from '../tournaments/access/tournament-access-action.enum';

describe('Standings write authorization', () => {
  it.each(['recalculateGroupStandings', 'recalculateStageStandings', 'recalculateTournamentStandings'])(
    'requires authenticated tournament edit access for %s', (method) => {
      const handler = StandingsController.prototype[method];
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([JwtAuthGuard, TournamentAccessGuard]);
      expect(Reflect.getMetadata(TOURNAMENT_ACCESS_KEY, handler)).toBe(TournamentAccessAction.EDIT);
    },
  );
  it('keeps the legacy table publicly readable', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StandingsController.prototype.getTournamentStandings)).toBeUndefined();
  });
});
