import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  CommunitiesService,
  CommunityActor,
} from '../communities/communities.service';
import { CommunityEntity } from '../communities/entities/community.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { VideoEntity } from './entities/video.entity';
import { SaveVideoDto, VideosQuery } from './video.dto';
import { normalizeVkVideo } from './vk-video';

@Injectable()
export class VideosService {
  constructor(
    private readonly db: DataSource,
    private readonly communities: CommunitiesService,
  ) {}

  async publicVideos(query: VideosQuery) {
    // The site community is independent of the currently selected/active tournament.
    const community = await this.db.getRepository(CommunityEntity).findOneBy({
      ...(query.communityId ? { id: query.communityId } : { isDefault: true }),
      isActive: true,
    });
    if (!community) return [];
    const rows = await this.db.getRepository(VideoEntity).find({
      where: {
        communityId: community.id,
        status: 'published',
        showOnHome: true,
      },
      order: { sortOrder: 'ASC', publishedAt: 'DESC', id: 'DESC' },
      take: 8,
    });
    return rows.map((video) => this.toPublic(video));
  }

  async publicCatalog(query: VideosQuery) {
    const { page, limit } = query;
    const community = await this.db.getRepository(CommunityEntity).findOneBy({
      ...(query.communityId ? { id: query.communityId } : { isDefault: true }),
      isActive: true,
    });
    if (!community) return { items: [], total: 0, page, limit };
    // The archive includes published videos outside the eight home-page slots.
    // TypeORM's default soft-delete scope also excludes archived records.
    const [rows, total] = await this.db
      .getRepository(VideoEntity)
      .findAndCount({
        where: { communityId: community.id, status: 'published' },
        order: { publishedAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return {
      items: rows.map((video) => this.toPublic(video)),
      total,
      page,
      limit,
    };
  }

  private toPublic({
    id,
    title,
    coverUrl,
    embedUrl,
    publishedAt,
    tournamentId,
    matchId,
  }: VideoEntity) {
    return {
      id,
      title,
      coverUrl,
      embedUrl,
      publishedAt,
      tournamentId,
      matchId,
    };
  }

  async list(communityId: number, query: VideosQuery, actor: CommunityActor) {
    await this.communities.assertAccess(communityId, actor);
    const repo = this.db.getRepository(VideoEntity);
    const [items, total] = await repo.findAndCount({
      where: { communityId },
      order: { sortOrder: 'ASC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const homeCount = await repo.countBy({
      communityId,
      status: 'published',
      showOnHome: true,
    });
    return { items, total, homeCount, page: query.page, limit: query.limit };
  }

  async options(
    communityId: number,
    tournamentId: number | undefined,
    actor: CommunityActor,
  ) {
    await this.communities.assertAccess(communityId, actor);
    const tournaments = await this.db.getRepository(TournamentEntity).find({
      where: { season: { competition: { communityId } } },
      order: { id: 'DESC' },
      select: { id: true, name: true },
    });
    if (tournamentId && !tournaments.some((t) => t.id === tournamentId))
      throw new NotFoundException('Турнир не найден в сообществе');
    const matches = tournamentId
      ? await this.db.getRepository(MatchEntity).find({
          where: { tournamentId },
          relations: { homeTeam: true, awayTeam: true },
          order: { matchDatetime: 'ASC', id: 'ASC' },
        })
      : [];
    return {
      tournaments,
      matches: matches.map((m) => ({
        id: m.id,
        label: `${m.homeTeam?.name ?? 'Участник не определён'} — ${m.awayTeam?.name ?? 'Участник не определён'}${m.matchDatetime ? ` · ${new Date(m.matchDatetime).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}` : ''} (#${m.id})`,
      })),
    };
  }

  async save(
    communityId: number,
    id: number | null,
    dto: SaveVideoDto,
    actor: CommunityActor,
  ) {
    await this.communities.assertAccess(communityId, actor);
    const embedUrl = normalizeVkVideo(dto.source);
    const coverUrl = dto.coverUrl || null;
    if (coverUrl) {
      // Do not allow a forged URL pointing outside the managed uploads directory.
      if (!/^\/uploads\/videos\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(coverUrl))
        throw new BadRequestException('Недопустимая обложка');
      try {
        await access(join(process.cwd(), coverUrl.slice(1)));
      } catch {
        throw new BadRequestException(
          'Обложка не найдена. Загрузите изображение заново.',
        );
      }
    }
    if (dto.status === 'published' && !coverUrl)
      throw new BadRequestException('Перед публикацией загрузите обложку');
    return this.db.transaction(async (manager) => {
      // Serialize the eight-slot limit even when two administrators publish at once.
      await manager.getRepository(CommunityEntity).findOneOrFail({
        where: { id: communityId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.communities.assertAccess(communityId, actor, false, manager);
      const repo = manager.getRepository(VideoEntity);
      const video = id
        ? await repo.findOneBy({ id, communityId })
        : repo.create({ communityId });
      if (!video) throw new NotFoundException('Видео не найдено');
      const tournamentId = dto.tournamentId ?? null;
      const matchId = dto.matchId ?? null;
      if (
        tournamentId &&
        !(await manager.getRepository(TournamentEntity).existsBy({
          id: tournamentId,
          season: { competition: { communityId } },
        }))
      )
        throw new BadRequestException('Турнир не принадлежит этому сообществу');
      if (
        matchId &&
        (!tournamentId ||
          !(await manager
            .getRepository(MatchEntity)
            .existsBy({ id: matchId, tournamentId })))
      )
        throw new BadRequestException('Выберите матч указанного турнира');
      if (dto.status === 'published' && dto.showOnHome) {
        const count = await repo.countBy({
          communityId,
          status: 'published',
          showOnHome: true,
        });
        const alreadyFeatured =
          video.status === 'published' && video.showOnHome;
        if (count >= 8 && !alreadyFeatured)
          throw new ConflictException(
            'На главной уже 8 видео. Сначала снимите одно с главной или с публикации.',
          );
      }
      const publishedAt =
        dto.status === 'published' ? (video.publishedAt ?? new Date()) : null;
      Object.assign(video, {
        title: dto.title.trim(),
        embedUrl,
        coverUrl,
        status: dto.status,
        showOnHome: dto.showOnHome,
        sortOrder: dto.sortOrder,
        publishedAt,
        tournamentId,
        matchId,
      });
      return repo.save(video);
    });
  }

  async archive(communityId: number, id: number, actor: CommunityActor) {
    await this.communities.assertAccess(communityId, actor);
    await this.db.transaction(async (manager) => {
      await manager.getRepository(CommunityEntity).findOneOrFail({
        where: { id: communityId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.communities.assertAccess(communityId, actor, false, manager);
      const result = await manager
        .getRepository(VideoEntity)
        .softDelete({ id, communityId, deletedAt: IsNull() });
      if (!result.affected) throw new NotFoundException('Видео не найдено');
    });
  }

  async cover(
    communityId: number,
    actor: CommunityActor,
    file?: { buffer: Buffer; mimetype: string },
  ) {
    await this.communities.assertAccess(communityId, actor);
    const b = file?.buffer;
    let extension: string | undefined;
    if (
      b &&
      file?.mimetype === 'image/png' &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      extension = 'png';
    if (
      b &&
      file?.mimetype === 'image/jpeg' &&
      b[0] === 255 &&
      b[1] === 216 &&
      b[2] === 255
    )
      extension = 'jpg';
    if (
      b &&
      file?.mimetype === 'image/webp' &&
      b.subarray(0, 4).toString() === 'RIFF' &&
      b.subarray(8, 12).toString() === 'WEBP'
    )
      extension = 'webp';
    if (!b || !extension || b.length > 5 * 1024 * 1024)
      throw new BadRequestException(
        'Загрузите PNG, JPEG или WebP размером до 5 МБ',
      );
    const name = `${randomUUID()}.${extension}`;
    const directory = join(process.cwd(), 'uploads', 'videos');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), b, { flag: 'wx' });
    return { url: `/uploads/videos/${name}` };
  }
}
