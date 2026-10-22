import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { TournamentMemberEntity } from '../../tournament-members/entities/tournament-member.entity';
import { TournamentMemberRole } from '../../tournament-members/enums/tournament-member-role.enum';
import { TournamentEntity } from '../entities/tournaments.entity';
import { TournamentAccessAction } from './tournament-access-action.enum';
import { TournamentAccessService } from './tournament-access.service';
import {
  CommunityMemberEntity,
  CommunityRole,
} from '../../communities/entities/community-member.entity';

describe('TournamentAccessService', () => {
  const tournamentRepository = {
    findOne: jest.fn(),
  };
  const memberRepository = {
    findOne: jest.fn(),
  };
  const communityMembers = {
    findOne: jest.fn(),
  };
  const service = new TournamentAccessService(
    tournamentRepository as unknown as Repository<TournamentEntity>,
    memberRepository as unknown as Repository<TournamentMemberEntity>,
    communityMembers as unknown as Repository<CommunityMemberEntity>,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(tournamentRepository.findOne).mockResolvedValue({
      id: 10,
      ownerUserId: 7,
      season: { competition: { community: { id: 1, isActive: true } } },
    });
    jest.mocked(communityMembers.findOne).mockResolvedValue({
      role: CommunityRole.Member,
    });
  });

  it('grants every action to a community owner', async () => {
    jest.mocked(communityMembers.findOne).mockResolvedValue({
      role: CommunityRole.Owner,
    });

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
    jest.mocked(memberRepository.findOne).mockResolvedValue({
      role: TournamentMemberRole.ORGANIZER,
    });

    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.EDIT),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.PUBLISH),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limits a viewer to read access', async () => {
    jest.mocked(memberRepository.findOne).mockResolvedValue({
      role: TournamentMemberRole.VIEWER,
    });

    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.READ),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.EDIT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not retain creator privileges after community access is revoked', async () => {
    jest.mocked(communityMembers.findOne).mockResolvedValue(null);
    await expect(
      service.assertAccess(10, { id: 7 }, TournamentAccessAction.EDIT),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberRepository.findOne).not.toHaveBeenCalled();
  });

  it('does not let a global admin bypass community membership', async () => {
    jest.mocked(communityMembers.findOne).mockResolvedValue(null);
    await expect(
      service.assertAccess(
        10,
        { id: 8, roles: ['admin'] },
        TournamentAccessAction.EDIT,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(communityMembers.findOne).toHaveBeenCalledWith({
      where: { communityId: 1, userId: 8, isActive: true },
    });
  });

  it('lets a community admin publish without being the creator', async () => {
    jest.mocked(communityMembers.findOne).mockResolvedValue({
      role: CommunityRole.Admin,
    });
    await expect(
      service.assertAccess(10, { id: 8 }, TournamentAccessAction.PUBLISH),
    ).resolves.toBeUndefined();
  });

  it('does not let an ordinary member inherit the old creator bypass', async () => {
    jest.mocked(memberRepository.findOne).mockResolvedValue(null);
    await expect(
      service.assertAccess(
        10,
        { id: 7 },
        TournamentAccessAction.MANAGE_MEMBERS,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not disclose permissions for a missing tournament', async () => {
    jest.mocked(tournamentRepository.findOne).mockResolvedValue(null);

    await expect(
      service.assertAccess(404, { id: 8 }, TournamentAccessAction.READ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a tournament admin review and publish but not delegate authority', async () => {
    jest.mocked(memberRepository.findOne).mockResolvedValue({
      role: TournamentMemberRole.ADMIN,
    });
    for (const action of [
      TournamentAccessAction.REVIEW_APPLICATIONS,
      TournamentAccessAction.EDIT,
      TournamentAccessAction.PUBLISH,
    ])
      await expect(
        service.assertAccess(10, { id: 8 }, action),
      ).resolves.toBeUndefined();
    await expect(
      service.assertAccess(
        10,
        { id: 8 },
        TournamentAccessAction.MANAGE_MEMBERS,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a super administrator to recover any tournament', async () => {
    jest.mocked(tournamentRepository.findOne).mockResolvedValue({
      id: 10,
      ownerUserId: 7,
    });

    await expect(
      service.assertAccess(
        10,
        { id: 99, roles: ['super_admin'] },
        TournamentAccessAction.PUBLISH,
      ),
    ).resolves.toBeUndefined();
  });
});
