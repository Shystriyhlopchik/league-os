import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CommunityEntity } from './entities/community.entity';
import {
  CommunityMemberEntity,
  CommunityRole,
} from './entities/community-member.entity';
import { CommunityAccessAuditEntity } from './entities/community-access-audit.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CompetitionEntity } from '../competitions/entities/competitions.entity';
import { SeasonEntity } from '../seasons/entities/season.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import {
  CommunityUsersQuery,
  CreateCommunityCompetitionDto,
  CreateCommunityDto,
  CreateCommunitySeasonDto,
} from './community.dto';

export interface CommunityActor {
  id: number;
  roles?: string[];
}

@Injectable()
export class CommunitiesService {
  constructor(
    @InjectRepository(CommunityEntity)
    private readonly communities: Repository<CommunityEntity>,
    private readonly dataSource: DataSource,
  ) {}

  isPlatformAdmin(actor: CommunityActor): boolean {
    return actor.roles?.includes('super_admin') ?? false;
  }

  async listForUser(actor: CommunityActor) {
    const memberships = await this.dataSource
      .getRepository(CommunityMemberEntity)
      .find({
        where: { userId: actor.id, isActive: true },
        relations: { community: true },
      });
    const communities = this.isPlatformAdmin(actor)
      ? await this.communities.find({
          where: { isActive: true },
          order: { name: 'ASC' },
        })
      : memberships.filter((m) => m.community.isActive).map((m) => m.community);
    return communities.map((c) => {
      const role =
        memberships.find((m) => m.communityId === c.id)?.role ?? null;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        role,
        canManageMembers:
          this.isPlatformAdmin(actor) || role === CommunityRole.Owner,
        canManageTournaments:
          this.isPlatformAdmin(actor) ||
          role === CommunityRole.Owner ||
          role === CommunityRole.Admin,
      };
    });
  }

  async assertAccess(
    id: number,
    actor: CommunityActor,
    manageMembers = false,
    manager = this.dataSource.manager,
  ) {
    const community = await manager
      .getRepository(CommunityEntity)
      .findOneBy({ id, isActive: true });
    if (!community) throw new NotFoundException('Сообщество не найдено');
    if (this.isPlatformAdmin(actor)) return community;
    const membership = await manager
      .getRepository(CommunityMemberEntity)
      .findOneBy({
        communityId: id,
        userId: actor.id,
        isActive: true,
      });
    const allowed = manageMembers
      ? [CommunityRole.Owner]
      : [CommunityRole.Owner, CommunityRole.Admin];
    if (!membership || !allowed.includes(membership.role)) {
      throw new ForbiddenException('Недостаточно прав в этом сообществе');
    }
    return community;
  }

  async create(dto: CreateCommunityDto, actor: CommunityActor) {
    if (!this.isPlatformAdmin(actor)) throw new ForbiddenException();
    return this.transaction(async (manager) => {
      const owner = await manager
        .getRepository(UserEntity)
        .findOneBy({ id: dto.ownerUserId, isActive: true });
      if (!owner)
        throw new NotFoundException('Активный пользователь не найден');
      const repository = manager.getRepository(CommunityEntity);
      const community = await repository.save(
        repository.create({ name: dto.name.trim(), slug: dto.slug }),
      );
      await manager.getRepository(CommunityMemberEntity).save({
        communityId: community.id,
        userId: owner.id,
        role: CommunityRole.Owner,
        isActive: true,
      });
      await this.audit(
        manager,
        community.id,
        actor.id,
        owner.id,
        null,
        CommunityRole.Owner,
      );
      return { id: community.id, name: community.name, slug: community.slug };
    });
  }

  async members(id: number, query: CommunityUsersQuery, actor: CommunityActor) {
    await this.assertAccess(id, actor);
    const qb = this.dataSource
      .getRepository(CommunityMemberEntity)
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.user', 'user')
      .select([
        'member.id',
        'member.role',
        'user.id',
        'user.username',
        'user.firstName',
        'user.lastName',
        'user.middleName',
        'user.isActive',
      ])
      .where('member.community_id = :id', { id })
      .andWhere('member.isActive = true');
    const search = query.search.trim();
    if (search)
      qb.andWhere(
        `("user"."username" ILIKE :search ESCAPE '\\' OR CONCAT_WS(' ', "user"."lastName", "user"."firstName", "user"."middleName") ILIKE :search ESCAPE '\\')`,
        { search: `%${this.escapeLike(search)}%` },
      );
    if (query.role) qb.andWhere('member.role = :role', { role: query.role });
    const [rows, total] = await qb
      .orderBy('member.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: rows.map((m) => ({ ...this.userSummary(m.user), role: m.role })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async candidates(id: number, search: string, actor: CommunityActor) {
    await this.assertAccess(id, actor, true);
    const value = search.trim();
    if (value.length < 3)
      throw new BadRequestException(
        'Введите точный логин или email (не менее 3 символов)',
      );
    const rows = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.username',
        'user.firstName',
        'user.lastName',
        'user.middleName',
        'user.isActive',
      ])
      .where('user.isActive = true')
      .andWhere(
        '(LOWER(user.username) = LOWER(:value) OR LOWER(user.email) = LOWER(:value))',
        { value },
      )
      .take(5)
      .getMany();
    return rows.map((u) => this.userSummary(u));
  }

  async setMember(
    id: number,
    targetId: number,
    role: CommunityRole | null,
    actor: CommunityActor,
  ) {
    return this.transaction(async (manager) => {
      await this.lockCommunity(manager, id);
      await this.assertAccess(id, actor, true, manager);
      const target = await manager
        .getRepository(UserEntity)
        .findOneBy({ id: targetId });
      if (!target) throw new NotFoundException('Пользователь не найден');
      if (role && !target.isActive)
        throw new BadRequestException(
          'Нельзя назначить права неактивному пользователю',
        );
      const repository = manager.getRepository(CommunityMemberEntity);
      const current = await repository.findOneBy({
        communityId: id,
        userId: targetId,
      });
      const before = current?.isActive ? current.role : null;
      if (before === role) return { userId: targetId, role };
      if (
        (role === CommunityRole.Owner || before === CommunityRole.Owner) &&
        !this.isPlatformAdmin(actor)
      ) {
        throw new ForbiddenException(
          'Изменять владельцев может только суперадминистратор платформы',
        );
      }
      if (before === CommunityRole.Owner) {
        // The community row serializes concurrent owner removals and grants.
        const owners = await repository.count({
          where: {
            communityId: id,
            role: CommunityRole.Owner,
            isActive: true,
            user: { isActive: true },
          },
        });
        if (owners <= 1 && target.isActive)
          throw new ConflictException(
            'Нельзя удалить последнего активного владельца сообщества',
          );
      }
      if (role) {
        await repository.save(
          repository.create({
            ...current,
            communityId: id,
            userId: targetId,
            role,
            isActive: true,
          }),
        );
      } else if (current) {
        await repository.update(current.id, { isActive: false });
      }
      if (
        !role ||
        (before &&
          before !== CommunityRole.Member &&
          role === CommunityRole.Member)
      ) {
        // Explicit tournament assignments must not retain access after revocation.
        const tournaments = await manager.getRepository(TournamentEntity).find({
          where: { season: { competition: { communityId: id } } },
          select: { id: true },
        });
        if (tournaments.length)
          await manager.getRepository(TournamentMemberEntity).delete({
            userId: targetId,
            tournamentId: In(tournaments.map((t) => t.id)),
          });
      }
      await this.audit(manager, id, actor.id, targetId, before, role);
      return { userId: targetId, role };
    });
  }

  async history(id: number, query: CommunityUsersQuery, actor: CommunityActor) {
    await this.assertAccess(id, actor, true);
    const [items, total] = await this.dataSource
      .getRepository(CommunityAccessAuditEntity)
      .findAndCount({
        where: { communityId: id },
        order: { id: 'DESC' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
    return { items, total, page: query.page, limit: query.limit };
  }

  async context(id: number, actor: CommunityActor) {
    const community = await this.assertAccess(id, actor);
    const competitions = await this.dataSource
      .getRepository(CompetitionEntity)
      .find({
        where: { communityId: id, isActive: true },
        relations: { seasons: true },
        order: { id: 'ASC' },
      });
    const tournaments = await this.dataSource
      .getRepository(TournamentEntity)
      .find({
        where: { season: { competition: { communityId: id } } },
        order: { id: 'DESC' },
      });
    return {
      community: { id, name: community.name },
      competitions: competitions.map((c) => ({
        id: c.id,
        name: c.name,
        seasons: c.seasons
          .filter((s) => s.isActive)
          .map((s) => ({ id: s.id, name: s.name, year: s.year })),
      })),
      tournaments: tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        seasonId: t.seasonId,
        lifecycleStatus: t.lifecycleStatus,
      })),
    };
  }

  async createCompetition(
    id: number,
    dto: CreateCommunityCompetitionDto,
    actor: CommunityActor,
  ) {
    return this.transaction(async (manager) => {
      await this.lockCommunity(manager, id);
      await this.assertAccess(id, actor, false, manager);
      const repo = manager.getRepository(CompetitionEntity);
      return repo.save(
        repo.create({ communityId: id, name: dto.name.trim(), slug: dto.slug }),
      );
    });
  }

  async createSeason(
    id: number,
    dto: CreateCommunitySeasonDto,
    actor: CommunityActor,
  ) {
    return this.transaction(async (manager) => {
      await this.lockCommunity(manager, id);
      await this.assertAccess(id, actor, false, manager);
      const competition = await manager
        .getRepository(CompetitionEntity)
        .findOneBy({ id: dto.competitionId, communityId: id, isActive: true });
      if (!competition)
        throw new NotFoundException(
          'Соревнование не найдено в этом сообществе',
        );
      const repo = manager.getRepository(SeasonEntity);
      if (
        await repo.exists({
          where: { competitionId: dto.competitionId, slug: dto.slug },
        })
      )
        throw new ConflictException('Сезон с таким адресом уже существует');
      return repo.save(repo.create({ ...dto, name: dto.name.trim() }));
    });
  }

  private async lockCommunity(manager: EntityManager, id: number) {
    const found = await manager
      .getRepository(CommunityEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!found) throw new NotFoundException('Сообщество не найдено');
  }

  private async audit(
    manager: EntityManager,
    communityId: number,
    actorUserId: number,
    targetUserId: number,
    previousRole: string | null,
    newRole: string | null,
  ) {
    await manager
      .getRepository(CommunityAccessAuditEntity)
      .save({ communityId, actorUserId, targetUserId, previousRole, newRole });
  }

  private userSummary(user: UserEntity) {
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName ?? null,
      isActive: user.isActive,
    };
  }

  private escapeLike(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  private async transaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      if (
        (error as { driverError?: { code?: string } }).driverError?.code ===
        '23505'
      )
        throw new ConflictException('Запись с таким адресом уже существует');
      throw error;
    }
  }
}
