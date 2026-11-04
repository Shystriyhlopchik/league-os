import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  CommunitiesService,
  CommunityActor,
} from '../communities/communities.service';
import { CommunitySquadsService } from '../registrations/community-squads.service';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { PlayerEntity } from './entities/player.entity';
import {
  PlayerIdentity,
  PlayerProfileAuditEntity,
  PlayerProfileChangeEntity,
} from './entities/player-profile-change.entity';
import {
  PlayerIdentityChangeDto,
  ReviewPlayerIdentityDto,
} from './player-profile.dto';

export function playerIdentity(
  player: Pick<
    PlayerEntity,
    'firstName' | 'lastName' | 'middleName' | 'birthDate'
  >,
): PlayerIdentity {
  return {
    firstName: player.firstName,
    lastName: player.lastName,
    middleName: player.middleName || null,
    birthDate: player.birthDate || null,
  };
}

// JSONB does not preserve JavaScript property order. Compare values, not JSON text.
function sameIdentity(a: PlayerIdentity, b: PlayerIdentity) {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    (a.middleName || null) === (b.middleName || null) &&
    (a.birthDate || null) === (b.birthDate || null)
  );
}

@Injectable()
export class PlayerProfilesService {
  constructor(
    private readonly db: DataSource,
    private readonly communities: CommunitiesService,
    private readonly squads: CommunitySquadsService,
  ) {}

  private async authorize(
    m: EntityManager,
    communityId: number,
    playerId: number,
    actor: CommunityActor,
    teamId?: number,
  ) {
    if (teamId !== undefined) {
      await this.squads.assertManage(communityId, teamId, actor, m);
      if (
        !(await m.exists(TeamPlayerEntity, {
          where: { communityId, teamId, playerId, isActive: true },
        }))
      )
        throw new NotFoundException(
          'Игрок отсутствует в текущем составе команды',
        );
    } else {
      await this.communities.assertAccess(communityId, actor, false, m);
      if (
        !(await m.exists(TeamPlayerEntity, {
          where: { communityId, playerId },
        }))
      )
        throw new NotFoundException('Игрок не найден в сообществе');
    }
  }

  private async player(m: EntityManager, id: number, lock = false) {
    const player = await m.findOne(PlayerEntity, {
      where: { id, isActive: true },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!player) throw new NotFoundException('Игрок не найден');
    return player;
  }

  async profile(
    communityId: number,
    playerId: number,
    actor: CommunityActor,
    teamId?: number,
  ) {
    const m = this.db.manager;
    await this.authorize(m, communityId, playerId, actor, teamId);
    const player = await this.player(m, playerId);
    // Only this team's/community's requests are visible; other communities' personal data stay private.
    const changes = await m.find(PlayerProfileChangeEntity, {
      where: {
        communityId,
        playerId,
        ...(teamId !== undefined ? { teamId } : {}),
      },
      order: { id: 'DESC' },
      take: 20,
    });
    const pending = await m.exists(PlayerProfileChangeEntity, {
      where: { playerId, status: 'submitted' },
    });
    const audit = await m.find(PlayerProfileAuditEntity, {
      where: { communityId, playerId },
      order: { id: 'DESC' },
      take: 20,
    });
    return { player, changes, pending, audit };
  }

  async search(
    communityId: number,
    search: string,
    page: number,
    actor: CommunityActor,
  ) {
    await this.communities.assertAccess(communityId, actor);
    const qb = this.db
      .getRepository(PlayerEntity)
      .createQueryBuilder('p')
      .where('p."isActive" = true')
      .andWhere(
        'EXISTS (SELECT 1 FROM team_players tp WHERE tp.player_id=p.id AND tp.community_id=:communityId)',
        { communityId },
      );
    const term = search.trim();
    if (term)
      qb.andWhere(
        `concat_ws(' ',p."lastName",p."firstName",p."middleName") ILIKE :search`,
        { search: `%${term.replace(/[%_\\]/g, '\\$&')}%` },
      );
    const [items, total] = await qb
      .orderBy('p.lastName', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .skip((page - 1) * 20)
      .take(20)
      .getManyAndCount();
    return { items, total, page, limit: 20 };
  }

  normalize(dto: PlayerIdentityChangeDto): PlayerIdentity {
    const name = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ');
    const firstName = name(dto.firstName),
      lastName = name(dto.lastName),
      middleName = name(dto.middleName);
    if (!firstName || !lastName)
      throw new BadRequestException('Укажите имя и фамилию');
    const date = new Date(`${dto.birthDate}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dto.birthDate) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.birthDate ||
      dto.birthDate >
        new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
          new Date(),
        )
    )
      throw new BadRequestException(
        'Укажите существующую дату рождения не позднее сегодняшней',
      );
    return {
      firstName,
      lastName,
      middleName: middleName || null,
      birthDate: dto.birthDate,
    };
  }

  async submit(
    communityId: number,
    playerId: number,
    dto: PlayerIdentityChangeDto,
    actor: CommunityActor,
  ) {
    const after = this.normalize(dto);
    return this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(72918401)');
      await this.authorize(m, communityId, playerId, actor, dto.teamId);
      const player = await this.player(m, playerId, true);
      if (dto.expectedVersion !== player.identityVersion)
        throw new ConflictException(
          'Карточка изменилась. Обновите профиль и повторите исправление',
        );
      const before = playerIdentity(player);
      if (sameIdentity(before, after))
        throw new BadRequestException('ФИО и дата рождения не изменены');
      if (
        await m.exists(PlayerProfileChangeEntity, {
          where: { playerId, status: 'submitted' },
        })
      )
        throw new ConflictException(
          'Исправление этого игрока уже на рассмотрении. Дождитесь решения организатора',
        );
      const change = await m.save(
        PlayerProfileChangeEntity,
        m.create(PlayerProfileChangeEntity, {
          playerId,
          communityId,
          teamId: dto.teamId ?? null,
          requestedByUserId: actor.id,
          baseVersion: player.identityVersion,
          before,
          after,
          reason: dto.reason.trim(),
          status: 'submitted',
          reviewedByUserId: null,
          reviewedAt: null,
          comment: null,
        }),
      );
      await this.audit(
        m,
        playerId,
        communityId,
        actor.id,
        'identity_submitted',
        before,
        after,
        change.reason,
        change.id,
      );
      return change;
    });
  }

  async requests(communityId: number, page: number, actor: CommunityActor) {
    await this.communities.assertAccess(communityId, actor);
    const [items, total] = await this.db
      .getRepository(PlayerProfileChangeEntity)
      .findAndCount({
        where: { communityId, status: 'submitted' },
        order: { id: 'ASC' },
        skip: (page - 1) * 20,
        take: 20,
      });
    return { items, total, page, limit: 20 };
  }

  private async assertSingleCommunity(
    m: EntityManager,
    playerId: number,
    communityId: number,
    actor: CommunityActor,
  ) {
    if (actor.roles?.includes('super_admin')) return;
    if (
      await m
        .getRepository(TeamPlayerEntity)
        .createQueryBuilder('tp')
        .where('tp.player_id=:playerId', { playerId })
        .andWhere('tp.community_id<>:communityId', { communityId })
        .getExists()
    )
      throw new ForbiddenException(
        'Игрок связан с несколькими сообществами. Исправление общей личности подтверждает системный администратор',
      );
  }

  async review(
    communityId: number,
    id: number,
    dto: ReviewPlayerIdentityDto,
    actor: CommunityActor,
  ) {
    return this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(72918401)');
      await this.communities.assertAccess(communityId, actor, false, m);
      const change = await m.findOne(PlayerProfileChangeEntity, {
        where: { id, communityId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!change) throw new NotFoundException('Запрос не найден');
      if (change.status !== 'submitted')
        throw new ConflictException('Запрос уже рассмотрен');
      const comment = dto.comment?.trim() || '';
      if (dto.decision === 'return') {
        if (!comment) throw new BadRequestException('Укажите причину возврата');
        change.status = 'changes_requested';
      } else {
        await this.assertSingleCommunity(
          m,
          change.playerId,
          communityId,
          actor,
        );
        const player = await this.player(m, change.playerId, true);
        if (
          player.identityVersion !== change.baseVersion ||
          !sameIdentity(playerIdentity(player), change.before)
        )
          throw new ConflictException(
            'Личные данные игрока уже изменены. Верните запрос для подготовки актуального исправления',
          );
        const hasRoster = await m.query(
          'SELECT 1 FROM tournament_roster_players WHERE player_id=$1 AND "isActive"=true LIMIT 1',
          [player.id],
        );
        if (
          change.before.birthDate !== change.after.birthDate &&
          hasRoster.length &&
          !dto.eligibilityComment?.trim()
        )
          throw new BadRequestException(
            'Дата рождения влияет на допуск. Проверьте регламент и укажите результат проверки допуска',
          );
        const duplicate = await m
          .getRepository(PlayerEntity)
          .createQueryBuilder('p')
          .where('p.id<>:id', { id: player.id })
          .andWhere(
            `replace(lower(regexp_replace(trim(p."firstName"),'\\s+',' ','g')),'ё','е')=replace(lower(:firstName),'ё','е')`,
            { firstName: change.after.firstName },
          )
          .andWhere(
            `replace(lower(regexp_replace(trim(p."lastName"),'\\s+',' ','g')),'ё','е')=replace(lower(:lastName),'ё','е')`,
            { lastName: change.after.lastName },
          )
          .andWhere('(p."birthDate"=:birthDate OR p."birthDate" IS NULL)', {
            birthDate: change.after.birthDate,
          })
          .getOne();
        if (duplicate && !dto.duplicateComment?.trim())
          throw new ConflictException(
            `Возможный дубль: ${duplicate.lastName} ${duplicate.firstName} (ID ${duplicate.id}). Проверьте карточки и укажите пояснение, если это разные люди. Объединение автоматически не выполняется`,
          );
        // Preserve the identity already recorded for completed/signed games before mutating the shared profile.
        await m.query(
          `UPDATE match_roster_players rp SET identity_snapshot=$2::jsonb
          FROM match_rosters r JOIN matches mt ON mt.id=r.match_id
          WHERE rp.match_roster_id=r.id AND rp.player_id=$1 AND rp.identity_snapshot IS NULL
          AND (mt.status='finished' OR EXISTS (SELECT 1 FROM match_service_sessions s WHERE s.match_id=mt.id AND s.status='protocol_signed'))`,
          [player.id, JSON.stringify(change.before)],
        );
        player.firstName = change.after.firstName;
        player.lastName = change.after.lastName;
        player.middleName = change.after.middleName as any;
        player.birthDate = change.after.birthDate as any;
        player.identityVersion += 1;
        await m.save(player);
        change.status = 'approved';
      }
      change.reviewedAt = new Date();
      change.reviewedByUserId = actor.id;
      change.comment =
        [comment, dto.eligibilityComment?.trim(), dto.duplicateComment?.trim()]
          .filter(Boolean)
          .join('\n') || null;
      await m.save(change);
      await this.audit(
        m,
        change.playerId,
        communityId,
        actor.id,
        change.status === 'approved'
          ? 'identity_approved'
          : 'identity_returned',
        change.before,
        change.after,
        change.comment || change.reason,
        change.id,
      );
      return change;
    });
  }

  private audit(
    m: EntityManager,
    playerId: number,
    communityId: number,
    actorUserId: number,
    action: string,
    before: object,
    after: object,
    reason: string,
    changeId: number | null = null,
  ) {
    return m.save(
      PlayerProfileAuditEntity,
      m.create(PlayerProfileAuditEntity, {
        playerId,
        communityId,
        actorUserId,
        action,
        before: { ...before },
        after: { ...after },
        reason,
        changeId,
      }),
    );
  }

  async photo(
    communityId: number,
    playerId: number,
    teamId: number | undefined,
    expectedPhotoUrl: string,
    buffer: Buffer,
    actor: CommunityActor,
  ) {
    if (!buffer?.length || buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('Выберите фото размером до 5 МБ');
    const extension = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'png'
      : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
        ? 'jpg'
        : buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP'
          ? 'webp'
          : null;
    if (!extension)
      throw new BadRequestException(
        'Фото должно быть в формате PNG, JPEG или WebP',
      );
    let savedPath: string | undefined;
    try {
      return await this.db.transaction(async (m) => {
        await this.authorize(m, communityId, playerId, actor, teamId);
        const player = await this.player(m, playerId, true);
        if ((player.photoUrl || '') !== expectedPhotoUrl)
          throw new ConflictException(
            'Фото уже изменено. Обновите профиль перед загрузкой',
          );
        const before = player.photoUrl || null;
        const directory = join(process.cwd(), 'uploads', 'players');
        const file = `${player.slug}-${randomUUID()}.${extension}`;
        await mkdir(directory, { recursive: true });
        savedPath = join(directory, file);
        await writeFile(savedPath, buffer, { flag: 'wx' });
        player.photoUrl = `/uploads/players/${file}`;
        await m.save(player);
        await this.audit(
          m,
          playerId,
          communityId,
          actor.id,
          'photo_updated',
          { photoUrl: before },
          { photoUrl: player.photoUrl },
          'Замена фотографии',
        );
        return { photoUrl: player.photoUrl };
      });
    } catch (error) {
      if (savedPath) await unlink(savedPath).catch(() => undefined);
      throw error;
    }
  }
}
