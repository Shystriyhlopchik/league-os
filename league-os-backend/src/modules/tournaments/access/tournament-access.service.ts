import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TournamentMemberEntity } from '../../tournament-members/entities/tournament-member.entity';
import { TournamentMemberRole } from '../../tournament-members/enums/tournament-member-role.enum';
import { TournamentEntity } from '../entities/tournaments.entity';
import type { AuthenticatedTournamentUser } from '../types/authenticated-tournament-request.type';
import { TournamentAccessAction } from './tournament-access-action.enum';
import {
  CommunityMemberEntity,
  CommunityRole,
} from '../../communities/entities/community-member.entity';

@Injectable()
export class TournamentAccessService {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentMemberEntity)
    private readonly memberRepository: Repository<TournamentMemberEntity>,
    @InjectRepository(CommunityMemberEntity)
    private readonly communityMemberRepository: Repository<CommunityMemberEntity>,
  ) {}

  async assertAccess(
    tournamentId: number,
    user: AuthenticatedTournamentUser,
    action: TournamentAccessAction,
  ): Promise<void> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: { season: { competition: { community: true } } },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (this.isSuperAdmin(user)) {
      return;
    }

    const community = tournament.season?.competition?.community;
    if (!community?.isActive)
      throw new ForbiddenException('Сообщество недоступно');
    const membership = await this.communityMemberRepository.findOne({
      where: { communityId: community.id, userId: user.id, isActive: true },
    });
    if (!membership)
      throw new ForbiddenException('Нет доступа к сообществу турнира');
    if ([CommunityRole.Owner, CommunityRole.Admin].includes(membership.role))
      return;

    const member = await this.memberRepository.findOne({
      where: { tournamentId, userId: user.id },
      select: { role: true },
    });

    const allowed =
      member?.role === TournamentMemberRole.ADMIN
        ? action !== TournamentAccessAction.MANAGE_MEMBERS
        : member?.role === TournamentMemberRole.ORGANIZER
          ? action === TournamentAccessAction.READ ||
            action === TournamentAccessAction.EDIT
          : member?.role === TournamentMemberRole.VIEWER &&
            action === TournamentAccessAction.READ;

    if (!allowed) {
      throw new ForbiddenException(
        'Insufficient permissions for this tournament',
      );
    }
  }

  private isSuperAdmin(user: AuthenticatedTournamentUser): boolean {
    return (user.roles ?? []).some((role) => role === 'super_admin');
  }
}
