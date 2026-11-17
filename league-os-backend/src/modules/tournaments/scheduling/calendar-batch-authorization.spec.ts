import { GUARDS_METADATA } from '@nestjs/common/constants';
import { TournamentsController } from '../tournaments.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TournamentAccessGuard } from '../access/tournament-access.guard';
import { TOURNAMENT_ACCESS_KEY } from '../access/tournament-access.decorator';
import { TournamentAccessAction } from '../access/tournament-access-action.enum';
describe('Calendar batch authorization', () => {
  it.each(['previewCalendarBatch', 'saveCalendarBatch'])(
    'requires tournament edit permission for %s',
    (method) => {
      const handler = TournamentsController.prototype[method];
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        JwtAuthGuard,
        TournamentAccessGuard,
      ]);
      expect(Reflect.getMetadata(TOURNAMENT_ACCESS_KEY, handler)).toBe(
        TournamentAccessAction.EDIT,
      );
    },
  );
});
