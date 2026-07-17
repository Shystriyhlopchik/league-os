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
});
