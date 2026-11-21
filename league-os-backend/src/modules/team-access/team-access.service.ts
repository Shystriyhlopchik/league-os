import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommunityMemberEntity } from '../communities/entities/community-member.entity';
import { CommunityTeamEntity } from '../registrations/entities/registration.entity';
import { TeamManagerEntity } from '../teams/entities/team-management.entity';

export const TEAM_PERMISSIONS = {
  profile: 'team.profile.edit',
  squad: 'team.squad.edit',
  application: 'team.application.manage',
  matchRoster: 'team.matchRoster.edit',
  access: 'team.access.manage',
} as const;
export type TeamAccessRole =
  'owner' | 'manager' | 'community_admin' | 'super_admin';
export function effectiveTeamRole(
  roles: readonly string[],
  member?: { isActive: boolean; role: string } | null,
  grant?: { isActive: boolean; role: string } | null,
): TeamAccessRole | null {
  if (roles.includes('super_admin')) return 'super_admin';
  if (member && !member.isActive) return null;
  if (member && ['owner', 'admin'].includes(member.role))
    return 'community_admin';
  return grant?.isActive && ['owner', 'manager'].includes(grant.role)
    ? (grant.role as 'owner' | 'manager')
    : null;
}
export function teamPermissions(role: TeamAccessRole) {
  const result: string[] = [
    TEAM_PERMISSIONS.profile,
    TEAM_PERMISSIONS.squad,
    TEAM_PERMISSIONS.application,
    TEAM_PERMISSIONS.matchRoster,
  ];
  if (role !== 'manager') result.push(TEAM_PERMISSIONS.access);
  return result;
}
@Injectable()
export class TeamAccessService {
  constructor(private readonly db: DataSource) {}
  async entries(actor: { id: number; roles?: string[] }) {
    const [links, members, grants] = await Promise.all([
      this.db.manager.find(CommunityTeamEntity, {
        where: { isActive: true },
        relations: { team: true, community: true },
        order: { communityId: 'ASC', teamId: 'ASC' },
      }),
      this.db.manager.find(CommunityMemberEntity, {
        where: { userId: actor.id },
      }),
      this.db.manager.find(TeamManagerEntity, {
        where: { userId: actor.id, isActive: true },
      }),
    ]);
    return links.flatMap((link) => {
      if (!link.team.isActive || !link.community.isActive) return [];
      const role = effectiveTeamRole(
        actor.roles ?? [],
        members.find((m) => m.communityId === link.communityId),
        grants.find(
          (g) => g.communityId === link.communityId && g.teamId === link.teamId,
        ),
      );
      return role
        ? [
            {
              communityId: link.communityId,
              teamId: link.teamId,
              teamName: link.team.name,
              role,
              permissions: teamPermissions(role),
            },
          ]
        : [];
    });
  }
}
