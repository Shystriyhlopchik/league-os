import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedTournamentRequest } from '../types/authenticated-tournament-request.type';
import { TOURNAMENT_ACCESS_KEY } from './tournament-access.decorator';
import { TournamentAccessAction } from './tournament-access-action.enum';
import { TournamentAccessService } from './tournament-access.service';

@Injectable()
export class TournamentAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessService: TournamentAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<TournamentAccessAction>(
      TOURNAMENT_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedTournamentRequest>();
    if (!request.user?.id) {
      throw new UnauthorizedException();
    }

    const tournamentId = Number(request.params.tournamentId);
    await this.accessService.assertAccess(tournamentId, request.user, action);
    return true;
  }
}
