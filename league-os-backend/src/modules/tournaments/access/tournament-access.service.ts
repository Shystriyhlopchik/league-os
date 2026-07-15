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

@Injectable()
export class TournamentAccessService {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentMemberEntity)
    private readonly memberRepository: Repository<TournamentMemberEntity>,
  ) {}

  async assertAccess(
    tournamentId: number,
    user: AuthenticatedTournamentUser,
    action: TournamentAccessAction,
  ): Promise<void> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      select: { id: true, ownerUserId: true },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (this.isSuperAdmin(user) || tournament.ownerUserId === user.id) {
      return;
    }

    const member = await this.memberRepository.findOne({
      where: { tournamentId, userId: user.id },
      select: { role: true },
    });

    const allowed =
      member?.role === TournamentMemberRole.ORGANIZER
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
