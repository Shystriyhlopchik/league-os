import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  CommunitiesService,
  CommunityActor,
} from '../communities/communities.service';
import { CommunityEntity } from '../communities/entities/community.entity';
import {
  CommunityMemberEntity,
  CommunityRole,
} from '../communities/entities/community-member.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { TeamManagerEntity } from '../teams/entities/team-management.entity';
import {
  CommunityTeamEntity,
  CommunityTransferRequestEntity,
} from './entities/registration.entity';
import { AddExistingPlayerDto, ReviewTransferDto } from './registration.dto';

@Injectable()
export class CommunitySquadsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly communities: CommunitiesService,
  ) {}

  async defaultCommunityId(manager = this.dataSource.manager) {
    const community = await manager.findOneBy(CommunityEntity, {
      isDefault: true,
      isActive: true,
    });
    if (!community)
      throw new ConflictException('Не настроено сообщество по умолчанию');
    return community.id;
  }

  async assertTeam(
    communityId: number,
    teamId: number,
    manager = this.dataSource.manager,
  ) {
    const link = await manager.findOne(CommunityTeamEntity, {
      where: { communityId, teamId, isActive: true },
      relations: { community: true, team: true },
    });
    if (!link?.community.isActive || !link.team.isActive)
      throw new NotFoundException('Команда не найдена в сообществе');
    return link;
  }

  async canManage(
    communityId: number,
    teamId: number,
    actor: CommunityActor,
    manager = this.dataSource.manager,
  ) {
    await this.assertTeam(communityId, teamId, manager);
    if (actor.roles?.includes('super_admin')) return true;
    const member = await manager.findOneBy(CommunityMemberEntity, {
      communityId,
      userId: actor.id,
    });
    if (member && !member.isActive) return false;
    if (
      member &&
      [CommunityRole.Admin, CommunityRole.Owner].includes(member.role)
    )
      return true;
    return manager.exists(TeamManagerEntity, {
      where: { communityId, teamId, userId: actor.id, isActive: true },
    });
  }

  async assertManage(
    communityId: number,
    teamId: number,
    actor: CommunityActor,
    manager = this.dataSource.manager,
  ) {
    if (!(await this.canManage(communityId, teamId, actor, manager)))
      throw new ForbiddenException('Нет прав на управление этой командой');
  }

  async lockCommunity(manager: EntityManager, communityId: number) {
    const community = await manager.findOne(CommunityEntity, {
      where: { id: communityId, isActive: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!community) throw new NotFoundException('Сообщество не найдено');
  }

  async myTeams(actor: CommunityActor) {
    const links = await this.dataSource
      .getRepository(CommunityTeamEntity)
      .find({
        where: { isActive: true },
        relations: { team: true, community: true },
        order: { teamId: 'ASC' },
      });
    const result: {
      communityId: number;
      communityName: string;
      teamId: number;
      name: string;
      profileStatus: string;
    }[] = [];
    for (const link of links) {
      if (
        link.team.isActive &&
        link.community.isActive &&
        (await this.canManage(link.communityId, link.teamId, actor))
      ) {
        result.push({
          communityId: link.communityId,
          communityName: link.community.name,
          teamId: link.teamId,
          name: link.team.name,
          profileStatus: link.team.profileStatus,
        });
      }
    }
    return result;
  }

  async roster(communityId: number, teamId: number, actor: CommunityActor) {
    await this.assertManage(communityId, teamId, actor);
    return this.dataSource.getRepository(TeamPlayerEntity).find({
      where: { communityId, teamId, isActive: true },
      relations: { player: true },
      order: { shirtNumber: 'ASC', id: 'ASC' },
    });
  }

  async search(
    communityId: number,
    teamId: number,
    query: string,
    actor: CommunityActor,
  ) {
    await this.assertManage(communityId, teamId, actor);
    const search = query.trim();
    if (search.length < 3) return [];
    const players = await this.dataSource
      .getRepository(PlayerEntity)
      .createQueryBuilder('p')
      .where('p."isActive" = true')
      .andWhere(
        `concat_ws(' ', p."lastName", p."firstName", p."middleName") ILIKE :search`,
        { search: `%${search.replace(/[%_\\]/g, '\\$&')}%` },
      )
      .orderBy('p.lastName', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .take(30)
      .getMany();
    return Promise.all(
      players.map(async (p) => {
        const affiliation = await this.dataSource
          .getRepository(TeamPlayerEntity)
          .findOne({
            where: { communityId, playerId: p.id, isActive: true },
            relations: { team: true },
          });
        return {
          id: p.id,
          name: [p.lastName, p.firstName, p.middleName]
            .filter(Boolean)
            .join(' '),
          birthYear: p.birthDate?.slice(0, 4),
          teamId: affiliation?.teamId ?? null,
          teamName: affiliation?.team.name ?? null,
        };
      }),
    );
  }

  async assertSlot(
    manager: EntityManager,
    communityId: number,
    teamId: number,
    shirtNumber: number,
  ) {
    const count = await manager.countBy(TeamPlayerEntity, {
      communityId,
      teamId,
      isActive: true,
    });
    if (count >= 12)
      throw new ConflictException(
        'В текущем составе команды может быть не более 12 игроков. Сначала освободите место',
      );
    const occupant = await manager.findOne(TeamPlayerEntity, {
      where: { communityId, teamId, shirtNumber, isActive: true },
      relations: { player: true },
    });
    if (occupant)
      throw new ConflictException(
        `Номер ${shirtNumber} уже занят: ${this.playerName(occupant.player)}. Выберите свободный номер или сначала измените номер этого игрока в составе команды`,
      );
  }

  private playerName(player: PlayerEntity) {
    return [player.lastName, player.firstName, player.middleName]
      .filter(Boolean)
      .join(' ');
  }

  async assertCaptainHandover(
    link: TeamPlayerEntity,
    actor: CommunityActor,
    manager: EntityManager,
  ) {
    if (
      await manager.exists(TeamManagerEntity, {
        where: {
          communityId: link.communityId,
          teamId: link.teamId,
          userId: actor.id,
          isActive: true,
        },
      })
    )
      return;
    if (!link.isCaptain || actor.roles?.includes('super_admin')) return;
    const player = await manager.findOneBy(PlayerEntity, { id: link.playerId });
    if (player?.userId !== actor.id) return;
    const member = await manager.findOneBy(CommunityMemberEntity, {
      communityId: link.communityId,
      userId: actor.id,
      isActive: true,
    });
    if (
      member &&
      [CommunityRole.Admin, CommunityRole.Owner].includes(member.role)
    )
      return;
    const replacement = await manager
      .getRepository(TeamPlayerEntity)
      .createQueryBuilder('tp')
      .innerJoin('tp.player', 'p')
      .innerJoin('p.user', 'u')
      .where(
        'tp.community_id = :communityId AND tp.team_id = :teamId AND tp.id != :id',
        { communityId: link.communityId, teamId: link.teamId, id: link.id },
      )
      .andWhere(
        'tp."isActive" AND tp."isCaptain" AND p."isActive" AND u."isActive"',
      )
      .getExists();
    if (!replacement)
      throw new ConflictException(
        'Сначала назначьте другого капитана со связанной учётной записью или обратитесь к администратору. Иначе команда потеряет доступ к управлению',
      );
  }

  async addExisting(
    communityId: number,
    teamId: number,
    dto: AddExistingPlayerDto,
    actor: CommunityActor,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCommunity(manager, communityId);
      await this.assertManage(communityId, teamId, actor, manager);
      const player = await manager.findOneBy(PlayerEntity, {
        id: dto.playerId,
        isActive: true,
      });
      if (!player) throw new NotFoundException('Игрок не найден');
      const current = await manager.findOneBy(TeamPlayerEntity, {
        communityId,
        playerId: player.id,
        isActive: true,
      });
      if (current?.teamId === teamId)
        throw new ConflictException('Игрок уже в составе');
      await this.assertSlot(manager, communityId, teamId, dto.shirtNumber);
      if (current) {
        const existing = await manager.findOneBy(
          CommunityTransferRequestEntity,
          {
            communityId,
            playerId: player.id,
            toTeamId: teamId,
            status: 'pending',
          },
        );
        if (existing)
          return { transferRequested: true, requestId: existing.id };
        const request = await manager.save(CommunityTransferRequestEntity, {
          communityId,
          playerId: player.id,
          fromTeamId: current.teamId,
          toTeamId: teamId,
          requestedByUserId: actor.id,
          shirtNumber: dto.shirtNumber,
          status: 'pending',
        });
        return { transferRequested: true, requestId: request.id };
      }
      const link = await manager.save(TeamPlayerEntity, {
        communityId,
        teamId,
        playerId: player.id,
        shirtNumber: dto.shirtNumber,
        isActive: true,
        isCaptain: false,
        joinedAt: new Date().toISOString().slice(0, 10),
      });
      return { transferRequested: false, teamPlayerId: link.id };
    });
  }

  async remove(
    communityId: number,
    teamId: number,
    teamPlayerId: number,
    actor: CommunityActor,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCommunity(manager, communityId);
      await this.assertManage(communityId, teamId, actor, manager);
      const link = await manager.findOneBy(TeamPlayerEntity, {
        id: teamPlayerId,
        communityId,
        teamId,
        isActive: true,
      });
      if (!link) throw new NotFoundException('Игрок команды не найден');
      await this.assertCaptainHandover(link, actor, manager);
      await manager.update(TeamPlayerEntity, link.id, {
        isActive: false,
        isCaptain: false,
        leftAt: new Date().toISOString().slice(0, 10),
      });
      return { id: link.id, isActive: false };
    });
  }

  async transfers(communityId: number, actor: CommunityActor) {
    await this.communities.assertAccess(communityId, actor);
    const requests = await this.dataSource
      .getRepository(CommunityTransferRequestEntity)
      .find({
        where: { communityId, status: 'pending' },
        relations: { player: true, fromTeam: true, toTeam: true },
        order: { id: 'ASC' },
      });
    if (!requests.length) return [];
    const occupants = await this.dataSource
      .getRepository(TeamPlayerEntity)
      .find({
        where: requests.map((request) => ({
          communityId,
          teamId: request.toTeamId,
          shirtNumber: request.shirtNumber,
          isActive: true,
        })),
        relations: { player: true },
      });
    return requests.map((request) => {
      const occupant = occupants.find(
        (link) =>
          link.teamId === request.toTeamId &&
          link.shirtNumber === request.shirtNumber,
      );
      return {
        ...request,
        numberConflict: occupant
          ? {
              playerId: occupant.playerId,
              name: this.playerName(occupant.player),
            }
          : null,
      };
    });
  }

  async reviewTransfer(
    communityId: number,
    requestId: number,
    dto: ReviewTransferDto,
    actor: CommunityActor,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCommunity(manager, communityId);
      await this.communities.assertAccess(communityId, actor, false, manager);
      const request = await manager.findOneBy(CommunityTransferRequestEntity, {
        id: requestId,
        communityId,
      });
      if (!request) throw new NotFoundException('Запрос перехода не найден');
      if (request.status !== 'pending')
        throw new ConflictException('Переход уже рассмотрен');
      if (dto.decision === 'reject' && !dto.comment?.trim())
        throw new BadRequestException('Укажите причину отказа');
      if (dto.decision === 'approve') {
        await this.assertTeam(communityId, request.toTeamId, manager);
        const current = await manager.findOneBy(TeamPlayerEntity, {
          communityId,
          playerId: request.playerId,
          isActive: true,
        });
        if ((current?.teamId ?? null) !== request.fromTeamId)
          throw new ConflictException(
            'Принадлежность игрока изменилась. Подайте новый запрос',
          );
        await this.assertSlot(
          manager,
          communityId,
          request.toTeamId,
          request.shirtNumber,
        );
        if (current)
          await manager.update(TeamPlayerEntity, current.id, {
            isActive: false,
            isCaptain: false,
            leftAt: new Date().toISOString().slice(0, 10),
          });
        await manager.save(TeamPlayerEntity, {
          communityId,
          teamId: request.toTeamId,
          playerId: request.playerId,
          shirtNumber: request.shirtNumber,
          isCaptain: false,
          isActive: true,
          joinedAt: new Date().toISOString().slice(0, 10),
        });
      }
      request.status = dto.decision === 'approve' ? 'approved' : 'rejected';
      request.reviewedByUserId = actor.id;
      request.comment = dto.comment?.trim() || null;
      return manager.save(request);
    });
  }
}
