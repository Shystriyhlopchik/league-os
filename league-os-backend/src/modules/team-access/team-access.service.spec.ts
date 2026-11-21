import {
  TeamAccessService,
  effectiveTeamRole,
  teamPermissions,
} from './team-access.service';
import { CommunityMemberEntity } from '../communities/entities/community-member.entity';
import { CommunityTeamEntity } from '../registrations/entities/registration.entity';
import { TeamManagerEntity } from '../teams/entities/team-management.entity';

describe('Unified team authority', () => {
  it('never derives management from global captain/player/admin roles', () => {
    for (const role of ['captain', 'player', 'admin', 'user', 'referee'])
      expect(effectiveTeamRole([role])).toBeNull();
  });
  it('accepts explicit owners/managers independently of playing status', () => {
    for (const role of ['owner', 'manager'] as const)
      expect(effectiveTeamRole(['user'], null, { role, isActive: true })).toBe(
        role,
      );
  });
  it('revocation and excluded membership take precedence over an old grant', () => {
    expect(
      effectiveTeamRole(['captain'], null, { role: 'owner', isActive: false }),
    ).toBeNull();
    expect(
      effectiveTeamRole(
        [],
        { role: 'admin', isActive: false },
        { role: 'owner', isActive: true },
      ),
    ).toBeNull();
  });
  it('community administration is scoped membership, not a global admin shortcut', () => {
    expect(effectiveTeamRole([], { role: 'owner', isActive: true })).toBe(
      'community_admin',
    );
    expect(
      effectiveTeamRole(['admin'], { role: 'member', isActive: true }),
    ).toBeNull();
    expect(
      effectiveTeamRole(['super_admin'], { role: 'member', isActive: false }),
    ).toBe('super_admin');
  });
  it('fails closed for unknown grant roles and grants access management only to owners/admins', () => {
    expect(
      effectiveTeamRole([], null, { role: 'captain', isActive: true }),
    ).toBeNull();
    expect(teamPermissions('manager')).toContain('team.matchRoster.edit');
    expect(teamPermissions('manager')).not.toContain('team.access.manage');
    expect(teamPermissions('owner')).toContain('team.access.manage');
  });
  it('builds the identity from active team/community links, not a playing-captain array', async () => {
    const db = {
      manager: {
        find: jest.fn(async (entity: unknown) => {
          if (entity === CommunityMemberEntity)
            return [{ communityId: 2, role: 'member', isActive: false }];
          if (entity === TeamManagerEntity)
            return [1, 2, 3].map((communityId) => ({
              communityId,
              teamId: 7,
              role: 'manager',
              isActive: true,
            }));
          if (entity === CommunityTeamEntity)
            return [1, 2, 3].map((communityId) => ({
              communityId,
              teamId: 7,
              team: { name: 'Команда', isActive: true },
              community: { isActive: communityId !== 3 },
            }));
          return [];
        }),
      },
    };
    const access = await new TeamAccessService(db as never).entries({
      id: 9,
      roles: ['captain'],
    });
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({
      communityId: 1,
      teamId: 7,
      role: 'manager',
    });
  });
});
