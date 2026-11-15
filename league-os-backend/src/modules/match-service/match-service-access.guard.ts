import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MatchEntity } from '../matches/entities/match.entity';
import { TournamentAccessService } from '../tournaments/access/tournament-access.service';
import { TournamentAccessAction } from '../tournaments/access/tournament-access-action.enum';
import { CommunityMemberEntity } from '../communities/entities/community-member.entity';

@Injectable()
export class MatchServiceAccessGuard implements CanActivate {
  constructor(
    private readonly db: DataSource,
    private readonly access: TournamentAccessService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const path = req.route.path as string;
    const supportedWrite = path.endsWith('/commands') || path.endsWith('/manual-events') ||
      path.endsWith('/manual-protocol/sign') || path.endsWith('/finished-matches/:matchId/events');
    if (req.method === 'POST' && !supportedWrite)
      throw new ConflictException(
        'Обновите страницу: обслуживание матча переведено на защищённый журнал действий',
      );
    const match = await this.db.getRepository(MatchEntity).findOne({
      where: { id: Number(req.params.matchId) },
      relations: { tournament: { season: { competition: true } } },
    });
    if (!match) throw new NotFoundException('Матч не найден');
    // There is no referee user_id on match_officials yet: referees are scoped
    // to active community membership, never granted cross-community access.
    if (req.user.roles?.includes('referee') && !['recover', 'reset'].includes(req.body?.action)) {
      const member = await this.db.getRepository(CommunityMemberEntity).exists({
        where: {
          userId: req.user.id,
          communityId: match.tournament.season.competition.communityId,
          isActive: true,
        },
      });
      if (member) return true;
    }
    try {
      await this.access.assertAccess(
        match.tournamentId,
        req.user,
        TournamentAccessAction.EDIT,
      );
    } catch {
      throw new ForbiddenException(
        'Нет права обслуживать матч этого сообщества',
      );
    }
    return true;
  }
}
