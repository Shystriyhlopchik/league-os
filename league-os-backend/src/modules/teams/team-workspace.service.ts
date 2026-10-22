import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, MoreThan } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TeamEntity } from './entities/team.entity';
import {
  TeamAccessRequestEntity,
  TeamManagementAuditEntity,
  TeamManagerEntity,
} from './entities/team-management.entity';
import { CommunitySquadsService } from '../registrations/community-squads.service';
import {
  CommunitiesService,
  CommunityActor,
} from '../communities/communities.service';
import {
  CommunityMemberEntity,
  CommunityRole,
} from '../communities/entities/community-member.entity';
import { CommunityEntity } from '../communities/entities/community.entity';
import { CommunityTeamEntity } from '../registrations/entities/registration.entity';
import { UserEntity } from '../users/entities/user.entity';
import {
  RequestTeamAccessDto,
  ReviewTeamAccessDto,
  SetTeamManagerDto,
  TeamProfileDto,
  UpdateTeamProfileDto,
} from './dto/team-workspace.dto';

@Injectable()
export class TeamWorkspaceService {
  constructor(
    private readonly db: DataSource,
    private readonly squads: CommunitySquadsService,
    private readonly communities: CommunitiesService,
  ) {}

  async workspace(actor: CommunityActor) {
    const [teams, communityId, memberships, requests] = await Promise.all([
      this.squads.myTeams(actor),
      this.squads.defaultCommunityId(),
      this.communities.listForUser(actor),
      this.db.manager.find(TeamAccessRequestEntity, {
        where: { userId: actor.id },
        relations: { team: true },
        order: { id: 'DESC' },
        take: 50,
      }),
    ]);
    const defaultCommunity = await this.db.manager.findOneByOrFail(
      CommunityEntity,
      { id: communityId, isActive: true },
    );
    return {
      teams,
      defaultCommunity: {
        id: defaultCommunity.id,
        name: defaultCommunity.name,
      },
      reviewCommunities: memberships
        .filter((c) => c.canManageTournaments)
        .map((c) => ({ id: c.id, name: c.name })),
      requests: requests.map((r) => ({
        id: r.id,
        teamId: r.teamId,
        teamName: r.team.name,
        status: r.status,
        comment: r.comment,
        reason: r.reason,
      })),
    };
  }

  async isCommunityAdmin(
    communityId: number,
    actor: CommunityActor,
    manager: EntityManager,
  ) {
    if (actor.roles?.includes('super_admin')) return true;
    const member = await manager.findOneBy(CommunityMemberEntity, {
      communityId,
      userId: actor.id,
      isActive: true,
    });
    return (
      !!member &&
      [CommunityRole.Admin, CommunityRole.Owner].includes(member.role)
    );
  }

  async canManageAccess(
    communityId: number,
    teamId: number,
    actor: CommunityActor,
    manager = this.db.manager,
  ) {
    if (!(await this.squads.canManage(communityId, teamId, actor, manager)))
      return false;
    if (await this.isCommunityAdmin(communityId, actor, manager)) return true;
    return manager.exists(TeamManagerEntity, {
      where: {
        communityId,
        teamId,
        userId: actor.id,
        role: 'owner',
        isActive: true,
      },
    });
  }

  private async assertAccessOwner(
    communityId: number,
    teamId: number,
    actor: CommunityActor,
    manager: EntityManager,
  ) {
    await this.squads.assertTeam(communityId, teamId, manager);
    if (!(await this.canManageAccess(communityId, teamId, actor, manager)))
      throw new ForbiddenException(
        'Права управления выдаёт владелец команды или администратор сообщества',
      );
  }

  private async lockTeam(
    communityId: number,
    teamId: number,
    actor: CommunityActor,
    manager: EntityManager,
  ) {
    await this.squads.lockCommunity(manager, communityId);
    await this.squads.assertManage(communityId, teamId, actor, manager);
    return manager.findOneOrFail(TeamEntity, {
      where: { id: teamId, isActive: true },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private version(team: TeamEntity, expectedVersion: number) {
    if (team.profileVersion !== expectedVersion)
      throw new ConflictException(
        'Карточка изменена в другом окне. Обновите страницу перед сохранением',
      );
  }

  async profile(communityId: number, teamId: number, actor: CommunityActor) {
    const { team } = await this.squads.assertTeam(communityId, teamId);
    await this.squads.assertManage(communityId, teamId, actor);
    return {
      team,
      communityId,
      canManageAccess: await this.canManageAccess(communityId, teamId, actor),
    };
  }

  private async assertNoDuplicate(
    communityId: number,
    profile: Pick<TeamEntity, 'name' | 'city' | 'village'>,
    manager: EntityManager,
    excludedId = 0,
  ) {
    const existing = await manager
      .getRepository(CommunityTeamEntity)
      .createQueryBuilder('ct')
      .innerJoinAndSelect('ct.team', 't')
      .where(
        'ct.community_id = :communityId AND ct."isActive" AND t."isActive" AND t.profile_status = :status AND t.id != :excludedId',
        { communityId, status: 'published', excludedId },
      )
      .andWhere('lower(trim(t.name)) = lower(:name)', {
        name: profile.name.trim(),
      })
      .andWhere(
        `lower(trim(coalesce(t.city,''))) = lower(:city) AND lower(trim(coalesce(t.village,''))) = lower(:village)`,
        {
          city: profile.city?.trim() || '',
          village: profile.village?.trim() || '',
        },
      )
      .getOne();
    if (existing)
      throw new ConflictException({
        code: 'TEAM_ALREADY_EXISTS',
        message:
          'Команда с таким названием и населённым пунктом уже есть. Запросите доступ к ней вместо создания дубля',
        teamId: existing.teamId,
      });
  }

  async create(dto: TeamProfileDto, actor: CommunityActor) {
    return this.db.transaction(async (manager) => {
      const communityId = await this.squads.defaultCommunityId(manager);
      await this.squads.lockCommunity(manager, communityId);
      const user = await manager.findOne(UserEntity, {
        where: { id: actor.id, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new ForbiddenException();
      if (
        (await manager.countBy(TeamEntity, {
          createdByUserId: actor.id,
          profileStatus: 'draft',
          isActive: true,
        })) >= 3
      )
        throw new ConflictException(
          'Можно иметь до трёх незавершённых команд. Сначала завершите существующие карточки',
        );
      if (
        (await manager.countBy(TeamEntity, {
          createdByUserId: actor.id,
          createdAt: MoreThan(new Date(Date.now() - 86400000)),
        })) >= 10
      )
        throw new HttpException('Слишком много новых команд за сутки', 429);
      await this.assertNoDuplicate(communityId, dto, manager);
      const team = await manager.save(TeamEntity, {
        ...dto,
        foundedYear: dto.foundedYear ?? undefined,
        slug: `team-${randomUUID()}`,
        profileStatus: 'draft',
        profileVersion: 1,
        createdByUserId: actor.id,
        isActive: true,
      });
      await manager
        .getRepository(CommunityTeamEntity)
        .createQueryBuilder()
        .insert()
        .values({ communityId, teamId: team.id, isActive: true })
        .orIgnore()
        .execute();
      await this.ensureMember(manager, communityId, actor.id);
      await manager.save(TeamManagerEntity, {
        communityId,
        teamId: team.id,
        userId: actor.id,
        role: 'owner',
        isActive: true,
      });
      await this.audit(
        manager,
        communityId,
        team.id,
        actor.id,
        actor.id,
        'team_created',
        null,
      );
      return { team, communityId, canManageAccess: true };
    });
  }

  async update(
    communityId: number,
    teamId: number,
    dto: UpdateTeamProfileDto,
    actor: CommunityActor,
  ) {
    return this.db.transaction(async (manager) => {
      const team = await this.lockTeam(communityId, teamId, actor, manager);
      this.version(team, dto.expectedVersion);
      const fields: (keyof TeamProfileDto)[] = [
        'name',
        'shortName',
        'description',
        'city',
        'village',
        'foundedYear',
        'primaryColor',
        'secondaryColor',
      ];
      for (const field of fields)
        if (field in dto) Reflect.set(team, field, dto[field]);
      this.validateProfile(team, team.profileStatus === 'published');
      if (team.profileStatus === 'published')
        await this.assertNoDuplicate(communityId, team, manager, team.id);
      team.profileVersion++;
      await manager.save(TeamEntity, team);
      return {
        team,
        communityId,
        canManageAccess: await this.canManageAccess(
          communityId,
          teamId,
          actor,
          manager,
        ),
      };
    });
  }

  validateProfile(
    team: Pick<TeamEntity, 'name' | 'city' | 'village' | 'foundedYear'>,
    publishing: boolean,
  ) {
    if (!team.name?.trim() || team.name.trim().length < 2)
      throw new BadRequestException('Укажите название команды');
    if (team.foundedYear && team.foundedYear > new Date().getFullYear() + 1)
      throw new BadRequestException('Проверьте год основания');
    if (publishing && !team.city?.trim() && !team.village?.trim())
      throw new BadRequestException(
        'Перед публикацией укажите город или населённый пункт',
      );
  }

  async publish(
    communityId: number,
    teamId: number,
    expectedVersion: number,
    actor: CommunityActor,
  ) {
    return this.db.transaction(async (manager) => {
      const team = await this.lockTeam(communityId, teamId, actor, manager);
      this.version(team, expectedVersion);
      this.validateProfile(team, true);
      await this.assertNoDuplicate(communityId, team, manager, team.id);
      team.profileStatus = 'published';
      team.profileVersion++;
      await manager.save(team);
      await this.audit(
        manager,
        communityId,
        teamId,
        actor.id,
        null,
        'profile_published',
        null,
      );
      return {
        team,
        communityId,
        canManageAccess: await this.canManageAccess(
          communityId,
          teamId,
          actor,
          manager,
        ),
      };
    });
  }

  logoExtension(buffer: Buffer) {
    if (buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('Логотип должен быть не больше 5 МБ');
    if (
      buffer.length >= 24 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return 'png';
    if (
      buffer.length >= 4 &&
      buffer[0] === 255 &&
      buffer[1] === 216 &&
      buffer[2] === 255
    )
      return 'jpg';
    if (
      buffer.length >= 16 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
      return 'webp';
    throw new BadRequestException(
      'Загрузите PNG, JPEG или WebP. SVG и другие форматы не поддерживаются',
    );
  }

  async uploadLogo(
    communityId: number,
    teamId: number,
    expectedVersion: number,
    actor: CommunityActor,
    buffer?: Buffer,
  ) {
    if (!buffer) throw new BadRequestException('Выберите файл логотипа');
    const extension = this.logoExtension(buffer);
    let createdPath: string | undefined;
    try {
      return await this.db.transaction(async (manager) => {
        const team = await this.lockTeam(communityId, teamId, actor, manager);
        this.version(team, expectedVersion);
        const filename = `${teamId}-${randomUUID()}.${extension}`;
        const directory = join(process.cwd(), 'uploads', 'teams');
        await mkdir(directory, { recursive: true });
        createdPath = join(directory, filename);
        await writeFile(createdPath, buffer, { flag: 'wx' });
        team.logoUrl = `/uploads/teams/${filename}`;
        team.profileVersion++;
        await manager.save(team);
        return {
          team,
          communityId,
          canManageAccess: await this.canManageAccess(
            communityId,
            teamId,
            actor,
            manager,
          ),
        };
      });
    } catch (error) {
      if (createdPath) await unlink(createdPath).catch(() => undefined);
      throw error;
    }
  }

  async search(query: string) {
    const communityId = await this.squads.defaultCommunityId();
    const q = query.trim().slice(0, 100);
    if (q.length < 3) return [];
    const teams = await this.db
      .getRepository(CommunityTeamEntity)
      .createQueryBuilder('ct')
      .innerJoinAndSelect('ct.team', 't')
      .where(
        'ct.community_id = :communityId AND ct."isActive" AND t."isActive" AND t.profile_status = :status',
        { communityId, status: 'published' },
      )
      .andWhere(`concat_ws(' ',t.name,t.city,t.village) ILIKE :search`, {
        search: `%${q.replace(/[%_\\]/g, '\\$&')}%`,
      })
      .orderBy('t.name', 'ASC')
      .take(30)
      .getMany();
    return teams.map(({ team }) => ({
      id: team.id,
      name: team.name,
      city: team.city,
      village: team.village,
      logoUrl: team.logoUrl,
    }));
  }

  async requestAccess(dto: RequestTeamAccessDto, actor: CommunityActor) {
    return this.db.transaction(async (manager) => {
      const communityId = await this.squads.defaultCommunityId(manager);
      await this.squads.lockCommunity(manager, communityId);
      const link = await this.squads.assertTeam(
        communityId,
        dto.teamId,
        manager,
      );
      if (link.team.profileStatus !== 'published')
        throw new NotFoundException('Команда не найдена');
      if (await this.squads.canManage(communityId, dto.teamId, actor, manager))
        throw new ConflictException('У вас уже есть доступ к команде');
      if (
        await manager.exists(TeamAccessRequestEntity, {
          where: {
            communityId,
            teamId: dto.teamId,
            userId: actor.id,
            status: 'pending',
          },
        })
      )
        throw new ConflictException('Запрос уже ожидает рассмотрения');
      if (
        (await manager.countBy(TeamAccessRequestEntity, {
          userId: actor.id,
          status: 'pending',
        })) >= 5
      )
        throw new ConflictException(
          'Дождитесь рассмотрения предыдущих запросов',
        );
      return manager.save(TeamAccessRequestEntity, {
        communityId,
        teamId: dto.teamId,
        userId: actor.id,
        reason: dto.reason,
        status: 'pending',
      });
    });
  }

  async accessRequests(communityId: number, actor: CommunityActor) {
    await this.communities.assertAccess(communityId, actor);
    const requests = await this.db.manager.find(TeamAccessRequestEntity, {
      where: { communityId, status: 'pending' },
      relations: { team: true, user: true },
      order: { id: 'ASC' },
      take: 100,
    });
    return requests.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      teamName: r.team.name,
      userId: r.userId,
      username: r.user.username,
      name: [r.user.lastName, r.user.firstName].join(' '),
      reason: r.reason,
      createdAt: r.createdAt,
    }));
  }

  async reviewAccess(
    communityId: number,
    id: number,
    dto: ReviewTeamAccessDto,
    actor: CommunityActor,
  ) {
    return this.db.transaction(async (manager) => {
      await this.squads.lockCommunity(manager, communityId);
      await this.communities.assertAccess(communityId, actor, false, manager);
      const request = await manager.findOneBy(TeamAccessRequestEntity, {
        id,
        communityId,
        status: 'pending',
      });
      if (!request)
        throw new ConflictException('Запрос уже рассмотрен или не найден');
      if (dto.decision === 'reject' && !dto.comment?.trim())
        throw new BadRequestException('Укажите причину отказа');
      if (dto.decision === 'approve') {
        await this.squads.assertTeam(communityId, request.teamId, manager);
        if (
          !(await manager.exists(UserEntity, {
            where: { id: request.userId, isActive: true },
          }))
        )
          throw new NotFoundException('Пользователь недоступен');
        const role = (await this.activeOwners(
          manager,
          communityId,
          request.teamId,
        ))
          ? 'manager'
          : 'owner';
        const existing = await manager.findOneBy(TeamManagerEntity, {
          communityId,
          teamId: request.teamId,
          userId: request.userId,
        });
        await manager.save(TeamManagerEntity, {
          ...existing,
          communityId,
          teamId: request.teamId,
          userId: request.userId,
          role: existing?.isActive ? existing.role : role,
          isActive: true,
        });
        await this.ensureMember(manager, communityId, request.userId);
      }
      request.status = dto.decision === 'approve' ? 'approved' : 'rejected';
      request.reviewedByUserId = actor.id;
      request.comment = dto.comment?.trim() || null;
      await manager.save(request);
      await this.audit(
        manager,
        communityId,
        request.teamId,
        actor.id,
        request.userId,
        `access_${request.status}`,
        request.comment,
      );
      return { id: request.id, status: request.status };
    });
  }

  private activeOwners(
    manager: EntityManager,
    communityId: number,
    teamId: number,
    excludedUser = 0,
  ) {
    return manager
      .getRepository(TeamManagerEntity)
      .createQueryBuilder('m')
      .innerJoin('m.user', 'u')
      .leftJoin(
        CommunityMemberEntity,
        'membership',
        'membership.community_id = m.community_id AND membership.user_id = m.user_id',
      )
      .where(
        'm.community_id = :communityId AND m.team_id = :teamId AND m.user_id != :excludedUser AND m.role = :role AND m."isActive" AND u."isActive" AND (membership.id IS NULL OR membership."isActive")',
        { communityId, teamId, excludedUser, role: 'owner' },
      )
      .getCount();
  }

  async managers(communityId: number, teamId: number, actor: CommunityActor) {
    await this.assertAccessOwner(communityId, teamId, actor, this.db.manager);
    const managers = await this.db.manager.find(TeamManagerEntity, {
      where: { communityId, teamId, isActive: true },
      relations: { user: true },
      order: { id: 'ASC' },
    });
    const audit = await this.db.manager.find(TeamManagementAuditEntity, {
      where: { communityId, teamId },
      order: { id: 'DESC' },
      take: 30,
    });
    return {
      managers: managers.map((m) => ({
        userId: m.userId,
        username: m.user.username,
        name: [m.user.lastName, m.user.firstName].join(' '),
        isActive: m.user.isActive,
        role: m.role,
      })),
      audit,
    };
  }

  async setManager(
    communityId: number,
    teamId: number,
    dto: SetTeamManagerDto,
    actor: CommunityActor,
  ) {
    return this.db.transaction(async (manager) => {
      await this.squads.lockCommunity(manager, communityId);
      await this.assertAccessOwner(communityId, teamId, actor, manager);
      const user = await manager.findOneBy(UserEntity, {
        username: dto.username,
        isActive: true,
      });
      if (!user)
        throw new NotFoundException(
          'Активный пользователь с таким точным логином не найден',
        );
      const existing = await manager.findOneBy(TeamManagerEntity, {
        communityId,
        teamId,
        userId: user.id,
      });
      if (
        existing?.isActive &&
        existing.role === 'owner' &&
        dto.role !== 'owner' &&
        !(await this.activeOwners(manager, communityId, teamId, user.id))
      )
        throw new ConflictException(
          'Сначала назначьте другого владельца команды',
        );
      await this.ensureMember(manager, communityId, user.id);
      await manager.save(TeamManagerEntity, {
        ...existing,
        communityId,
        teamId,
        userId: user.id,
        role: dto.role,
        isActive: true,
      });
      await this.audit(
        manager,
        communityId,
        teamId,
        actor.id,
        user.id,
        'manager_assigned',
        dto.role,
      );
      return { userId: user.id, role: dto.role };
    });
  }

  async removeManager(
    communityId: number,
    teamId: number,
    userId: number,
    actor: CommunityActor,
  ) {
    return this.db.transaction(async (manager) => {
      await this.squads.lockCommunity(manager, communityId);
      await this.assertAccessOwner(communityId, teamId, actor, manager);
      const existing = await manager.findOneBy(TeamManagerEntity, {
        communityId,
        teamId,
        userId,
        isActive: true,
      });
      if (!existing) throw new NotFoundException('Назначение не найдено');
      if (
        existing.role === 'owner' &&
        !(await this.activeOwners(manager, communityId, teamId, userId))
      )
        throw new ConflictException(
          'Нельзя удалить последнего активного владельца команды',
        );
      existing.isActive = false;
      await manager.save(existing);
      await this.audit(
        manager,
        communityId,
        teamId,
        actor.id,
        userId,
        'manager_removed',
        existing.role,
      );
      return { userId, isActive: false };
    });
  }

  private async ensureMember(
    manager: EntityManager,
    communityId: number,
    userId: number,
  ) {
    const existing = await manager.findOneBy(CommunityMemberEntity, {
      communityId,
      userId,
    });
    if (existing && !existing.isActive)
      throw new ForbiddenException(
        'Пользователь исключён из сообщества. Сначала восстановите его участие',
      );
    if (!existing)
      await manager.save(CommunityMemberEntity, {
        communityId,
        userId,
        role: CommunityRole.Member,
        isActive: true,
      });
  }
  private audit(
    manager: EntityManager,
    communityId: number,
    teamId: number,
    actorUserId: number,
    targetUserId: number | null,
    action: string,
    comment: string | null,
  ) {
    return manager.save(TeamManagementAuditEntity, {
      communityId,
      teamId,
      actorUserId,
      targetUserId,
      action,
      comment,
    });
  }
}
