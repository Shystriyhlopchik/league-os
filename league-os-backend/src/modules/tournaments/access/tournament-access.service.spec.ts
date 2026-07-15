import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { TournamentMemberEntity } from '../../tournament-members/entities/tournament-member.entity';
import { TournamentMemberRole } from '../../tournament-members/enums/tournament-member-role.enum';
import { TournamentEntity } from '../entities/tournaments.entity';
import { TournamentAccessAction } from './tournament-access-action.enum';
import { TournamentAccessService } from './tournament-access.service';

describe('TournamentAccessService', () => {
  const tournamentRepository = {
    findOne: jest.fn(),
  } as unknown as Repository<TournamentEntity>;
  const memberRepository = {
    findOne: jest.fn(),
  } as unknown as Repository<TournamentMemberEntity>;
  const service = new TournamentAccessService(
    tournamentRepository,
    memberRepository,
  );

  beforeEach(() => jest.clearAllMocks());

  it('grants every action to the owner', async () => {
    jest.mocked(tournamentRepository.findOne).mockResolvedValue({
      id: 10,
      ownerUserId: 7,
    } as TournamentEntity);

    await expect(
      service.assertAccess(
        10,
        { id: 7 },
        TournamentAccessAction.MANAGE_MEMBERS,
      ),
    ).resolves.toBeUndefined();
    expect(memberRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows an organizer to edit but not publish', async () => {
    jest.mocked(tournamentRepository.findOne).mockResolvedValue({
      id: 10,
      ownerUserId: 7,
    } as TournamentEntity);
    jest.mocked(memberRepository.findOne).mockResolvedValue({
      role: TournamentMemberRole.ORGANIZER,
    } as TournamentMemberEntity);

    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.EDIT),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.PUBLISH),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limits a viewer to read access', async () => {
    jest.mocked(tournamentRepository.findOne).mockResolvedValue({
      id: 10,
      ownerUserId: 7,
    } as TournamentEntity);
    jest.mocked(memberRepository.findOne).mockResolvedValue({
      role: TournamentMemberRole.VIEWER,
    } as TournamentMemberEntity);

    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.READ),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.EDIT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not disclose permissions for a missing tournament', async () => {
    jest.mocked(tournamentRepository.findOne).mockResolvedValue(null);

    await expect(
      service.assertAccess(404, { id: 8 }, TournamentAccessAction.READ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows a super administrator to recover any tournament', async () => {
    jest.mocked(tournamentRepository.findOne).mockResolvedValue({
      id: 10,
      ownerUserId: 7,
    } as TournamentEntity);

    await expect(
      service.assertAccess(
        10,
        { id: 99, roles: ['super_admin'] },
        TournamentAccessAction.PUBLISH,
      ),
    ).resolves.toBeUndefined();
  });
});
