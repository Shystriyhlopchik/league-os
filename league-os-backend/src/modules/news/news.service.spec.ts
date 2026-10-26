import type { Repository } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { NewsEntity } from './entities/news.entity';
import { NewsService } from './news.service';

describe('NewsService', () => {
  const rows: NewsEntity[] = [];
  const repository = {
    create: jest.fn((value) => ({ id: rows.length + 1, ...value })),
    save: jest.fn(async (value: NewsEntity) => {
      const index = rows.findIndex((row) => row.id === value.id);
      if (index >= 0) rows[index] = value;
      else rows.push(value);
      return value;
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<NewsEntity> }) =>
      rows.find((row) =>
        Object.entries(where).every(
          ([key, value]) => row[key as keyof NewsEntity] === value,
        ),
      ),
    ),
    find: jest.fn(async () => rows.filter((row) => row.status === 'published')),
    findAndCount: jest.fn(async () => [rows, rows.length]),
    softDelete: jest.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<NewsEntity>;
  const service = new NewsService(repository);
  Object.defineProperty(repository, 'manager', {
    value: {
      transaction: async (fn: (m: unknown) => unknown) =>
        fn({ getRepository: () => repository }),
    },
  });

  beforeEach(() => {
    rows.length = 0;
    jest.clearAllMocks();
  });

  it('creates a draft with a unique generated slug and author', async () => {
    const created = await service.createDraft(
      { title: 'Финал Дворовой лиги', content: 'Текст новости' },
      7,
    );

    expect(created).toEqual(
      expect.objectContaining({
        slug: 'final-dvorovoy-ligi',
        status: 'draft',
        authorUserId: 7,
      }),
    );
  });

  it('publishes and unpublishes an existing article explicitly', async () => {
    const created = await service.createDraft(
      { title: 'Новая статья', content: 'Содержимое' },
      7,
    );

    const published = await service.publish(created.id, 8);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeInstanceOf(Date);

    const draft = await service.unpublish(created.id, 8);
    expect(draft.status).toBe('draft');
    expect(draft.publishedAt).toBeNull();
  });

  it('does not allow a duplicate manually selected slug', async () => {
    await service.createDraft(
      { title: 'Первая', slug: 'match-report', content: 'Текст' },
      7,
    );

    const second = await service.createDraft(
      { title: 'Вторая', content: 'Текст' },
      7,
    );
    await expect(
      service.updateDraft(second.id, { slug: 'match-report' }, 7),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a cover when its content is not a supported image', async () => {
    await expect(
      service.saveCover(Buffer.from('not an image'), 'image/png'),
    ).rejects.toThrow('PNG, JPEG или WebP');
  });

  it('keeps published URLs locked even after unpublishing', async () => {
    const news = await service.createDraft(
      { title: 'Новости лиги', content: 'Текст' },
      7,
    );
    await service.publish(news.id, 7);
    await service.unpublish(news.id, 7);
    await expect(
      service.updateDraft(news.id, { slug: 'another-address' }, 7),
    ).rejects.toThrow('менять нельзя');
  });

  it('saves an independent VK teaser and validates managed image paths', async () => {
    const news = await service.createDraft(
      {
        title: 'Новости лиги',
        content: 'Полный текст',
        vkText: ' Короткий анонс ',
        vkTitle: ' Для ВК ',
      },
      7,
      1,
    );
    expect(news.vkText).toBe('Короткий анонс');
    expect(news.vkTitle).toBe('Для ВК');
    expect(news.communityId).toBe(1);
    await expect(
      service.updateDraft(
        news.id,
        { vkImageUrl: 'https://example.com/photo.jpg' },
        7,
      ),
    ).rejects.toThrow('JPEG или PNG');
    await expect(
      service.updateDraft(
        news.id,
        {
          vkImageUrl: '/uploads/news/00000000-0000-0000-0000-000000000000.png',
        },
        7,
      ),
    ).resolves.toMatchObject({
      vkImageUrl: expect.stringContaining('/uploads/news/'),
    });
  });
});
