import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VideosService } from './videos.service';
import { VideoEntity } from './entities/video.entity';
import { CommunityEntity } from '../communities/entities/community.entity';
import { SaveVideoDto, VideosQuery } from './video.dto';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  access: jest.fn().mockResolvedValue(undefined),
}));

describe('Community videos', () => {
  const actor = { id: 7, roles: [] };
  let service: VideosService;
  let repo: any;
  let community: any;
  let access: any;
  let manager: any;
  const payload = (overrides = {}): SaveVideoDto => ({
    title: 'Обзор матча',
    source: 'https://vk.com/video-1_2',
    status: 'draft',
    showOnHome: true,
    sortOrder: 0,
    ...overrides,
  });
  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      countBy: jest.fn().mockResolvedValue(0),
      create: jest.fn((v) => ({ ...v })),
      save: jest.fn((v) => Promise.resolve(v)),
      findOneBy: jest.fn().mockResolvedValue(null),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    community = {
      findOneBy: jest.fn().mockResolvedValue({ id: 2 }),
      findOneOrFail: jest.fn().mockResolvedValue({ id: 2 }),
    };
    access = { assertAccess: jest.fn().mockResolvedValue({ id: 2 }) };
    manager = {
      getRepository: jest.fn((entity) =>
        entity === CommunityEntity ? community : repo,
      ),
    };
    const db: any = {
      ...manager,
      transaction: jest.fn((work) => work(manager)),
    };
    service = new VideosService(db, access);
  });
  it('public home defaults to the active default community and caps at eight', async () => {
    await service.publicVideos(new VideosQuery());
    expect(community.findOneBy).toHaveBeenCalledWith({
      isDefault: true,
      isActive: true,
    });
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 2, status: 'published', showOnHome: true },
        take: 8,
      }),
    );
  });
  it('does not disclose unpublished fields in public results', async () => {
    repo.find.mockResolvedValue([
      {
        id: 1,
        title: 'Видео',
        status: 'published',
        communityId: 2,
        deletedAt: null,
      },
    ]);
    const result = await service.publicVideos(new VideosQuery());
    expect(result[0]).not.toHaveProperty('status');
    expect(result[0]).not.toHaveProperty('deletedAt');
  });
  it('returns no videos when the default community is absent', async () => {
    community.findOneBy.mockResolvedValue(null);
    expect(await service.publicVideos(new VideosQuery())).toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });
  it.each(['list', 'save', 'archive', 'cover', 'options'])(
    'denies %s without community management access',
    async (action) => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());
      const calls = {
        list: () => service.list(2, new VideosQuery(), actor),
        save: () => service.save(2, null, payload(), actor),
        archive: () => service.archive(2, 1, actor),
        cover: () => service.cover(2, actor),
        options: () => service.options(2, undefined, actor),
      };
      await expect(calls[action]()).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.softDelete).not.toHaveBeenCalled();
    },
  );
  it('normalizes sources and allows saving a draft without a cover', async () => {
    const saved = await service.save(2, null, payload(), actor);
    expect(saved.embedUrl).toBe(
      'https://vkvideo.ru/video_ext.php?oid=-1&id=2&autoplay=0',
    );
    expect(saved.communityId).toBe(2);
    expect(saved.publishedAt).toBeNull();
    expect(community.findOneOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
  it('requires a cover before publication', async () => {
    await expect(
      service.save(2, null, payload({ status: 'published' }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a ninth published home video', async () => {
    repo.countBy.mockResolvedValue(8);
    await expect(
      service.save(
        2,
        null,
        payload({
          status: 'published',
          coverUrl: '/uploads/videos/12345678-1234-1234-1234-123456789abc.jpg',
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('allows editing a featured video when all eight slots are occupied', async () => {
    repo.countBy.mockResolvedValue(8);
    repo.findOneBy.mockResolvedValue({
      id: 1,
      communityId: 2,
      status: 'published',
      showOnHome: true,
    });
    await expect(
      service.save(
        2,
        1,
        payload({
          status: 'published',
          coverUrl: '/uploads/videos/12345678-1234-1234-1234-123456789abc.jpg',
        }),
        actor,
      ),
    ).resolves.toHaveProperty('status', 'published');
  });
  it('allows nonfeatured publications even when all eight slots are occupied', async () => {
    repo.countBy.mockResolvedValue(8);
    await expect(
      service.save(
        2,
        null,
        payload({
          status: 'published',
          showOnHome: false,
          coverUrl: '/uploads/videos/12345678-1234-1234-1234-123456789abc.jpg',
        }),
        actor,
      ),
    ).resolves.toHaveProperty('showOnHome', false);
  });
  it('never accepts remote or traversal cover URLs', async () => {
    await expect(
      service.save(
        2,
        null,
        payload({ coverUrl: '/uploads/videos/../../secret.png' }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('scopes updates and deletion by community ID', async () => {
    await expect(service.save(2, 99, payload(), actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 99, communityId: 2 });
    await service.archive(2, 99, actor);
    expect(repo.softDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99, communityId: 2 }),
    );
  });
  it('validates linked tournaments and matches', async () => {
    repo.existsBy = jest.fn().mockResolvedValue(false);
    await expect(
      service.save(2, null, payload({ tournamentId: 77 }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save(2, null, payload({ matchId: 88 }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects masquerading SVG uploads', async () => {
    await expect(
      service.cover(2, actor, {
        buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
        mimetype: 'image/png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
