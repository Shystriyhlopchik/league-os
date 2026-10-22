import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { CommunitiesService } from './communities.service';
import { CommunityEntity } from './entities/community.entity';
import {
  CommunityMemberEntity,
  CommunityRole,
} from './entities/community-member.entity';
import { CommunityAccessAuditEntity } from './entities/community-access-audit.entity';
import { UserEntity } from '../users/entities/user.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { RoleEntity } from '../roles/entities/role.entity';

describe('Community role boundaries', () => {
  const communities = { findOne: jest.fn(), findOneBy: jest.fn() };
  const members = {
    findOneBy: jest.fn(),
    count: jest.fn(),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(),
    update: jest.fn(),
  };
  const users = { findOneBy: jest.fn() };
  const audit = { save: jest.fn() };
  const tournaments = { find: jest.fn() };
  const grants = { delete: jest.fn() };
  const repositories = new Map<unknown, unknown>([
    [CommunityEntity, communities],
    [CommunityMemberEntity, members],
    [UserEntity, users],
    [CommunityAccessAuditEntity, audit],
    [TournamentEntity, tournaments],
    [TournamentMemberEntity, grants],
  ]);
  const manager = {
    getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
  };
  const dataSource = {
    manager,
    getRepository: manager.getRepository,
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  } as unknown as DataSource;
  const service = new CommunitiesService(
    communities as unknown as Repository<CommunityEntity>,
    dataSource,
  );
  const actor = { id: 1, roles: ['user'] };
  let actorRole: CommunityRole | null;
  let targetRole: CommunityRole | null;

  beforeEach(() => {
    jest.clearAllMocks();
    actorRole = CommunityRole.Owner;
    targetRole = CommunityRole.Member;
    communities.findOne.mockResolvedValue({ id: 10, isActive: true });
    communities.findOneBy.mockResolvedValue({ id: 10, isActive: true });
    users.findOneBy.mockResolvedValue({ id: 2, isActive: true });
    members.findOneBy.mockImplementation(
      ({ userId, communityId }: { userId: number; communityId: number }) =>
        Promise.resolve(
          communityId !== 10
            ? null
            : userId === 1
              ? actorRole && { id: 1, role: actorRole, isActive: true }
              : targetRole && { id: 2, role: targetRole, isActive: true },
        ),
    );
    members.count.mockResolvedValue(1);
    tournaments.find.mockResolvedValue([{ id: 100 }]);
  });

  it('grants only a scoped role and records the actor and old/new roles', async () => {
    await service.setMember(10, 2, CommunityRole.Admin, actor);
    expect(members.save).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 10, userId: 2, role: 'admin' }),
    );
    expect(audit.save).toHaveBeenCalledWith({
      communityId: 10,
      actorUserId: 1,
      targetUserId: 2,
      previousRole: 'member',
      newRole: 'admin',
    });
    expect(manager.getRepository).not.toHaveBeenCalledWith(RoleEntity);
  });

  it('prevents a community admin from granting roles', async () => {
    actorRole = CommunityRole.Admin;
    await expect(
      service.setMember(10, 2, CommunityRole.Admin, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(members.save).not.toHaveBeenCalled();
    expect(audit.save).not.toHaveBeenCalled();
  });

  it('prevents a global admin with no local ownership from granting roles', async () => {
    actorRole = null;
    await expect(
      service.setMember(10, 2, CommunityRole.Admin, {
        id: 1,
        roles: ['admin'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let an owner act in a different community', async () => {
    await expect(
      service.setMember(20, 2, CommunityRole.Admin, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(members.save).not.toHaveBeenCalled();
  });

  it('revokes explicit grants only for tournaments of the affected community', async () => {
    targetRole = CommunityRole.Admin;
    await service.setMember(10, 2, CommunityRole.Member, actor);
    expect(tournaments.find).toHaveBeenCalledWith({
      where: { season: { competition: { communityId: 10 } } },
      select: { id: true },
    });
    expect(grants.delete).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2 }),
    );
    expect(audit.save).toHaveBeenCalledWith(
      expect.objectContaining({ previousRole: 'admin', newRole: 'member' }),
    );
  });

  it('removes membership without removing the user account', async () => {
    await service.setMember(10, 2, null, actor);
    expect(members.update).toHaveBeenCalledWith(2, { isActive: false });
    expect(grants.delete).toHaveBeenCalled();
  });

  it('rejects grants to inactive accounts', async () => {
    users.findOneBy.mockResolvedValue({ id: 2, isActive: false });
    await expect(
      service.setMember(10, 2, CommunityRole.Admin, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(members.save).not.toHaveBeenCalled();
  });

  it('does not allow a community owner to appoint another owner', async () => {
    await expect(
      service.setMember(10, 2, CommunityRole.Owner, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('serializes owner changes and protects the last active owner, even against a platform admin', async () => {
    targetRole = CommunityRole.Owner;
    await expect(
      service.setMember(10, 2, CommunityRole.Member, {
        id: 3,
        roles: ['super_admin'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(communities.findOne).toHaveBeenCalledWith({
      where: { id: 10 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(members.save).not.toHaveBeenCalled();
    expect(members.count).toHaveBeenCalledWith({
      where: {
        communityId: 10,
        role: 'owner',
        isActive: true,
        user: { isActive: true },
      },
    });
  });

  it('allows transferring authority when another active owner remains', async () => {
    targetRole = CommunityRole.Owner;
    members.count.mockResolvedValue(2);
    await service.setMember(10, 2, CommunityRole.Member, {
      id: 3,
      roles: ['super_admin'],
    });
    expect(members.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' }),
    );
  });

  it('makes repeated assignments idempotent', async () => {
    targetRole = CommunityRole.Admin;
    await service.setMember(10, 2, CommunityRole.Admin, actor);
    expect(members.save).not.toHaveBeenCalled();
    expect(audit.save).not.toHaveBeenCalled();
  });
});
