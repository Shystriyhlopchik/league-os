import { DataSource } from 'typeorm';
import { NewsEntity } from './entities/news.entity';
import { NewsPublicationEntity } from './entities/news-publication.entity';
import { NewsPublicationService } from './news-publication.service';
import { NewsAccessService } from './news-access.service';
import { VkDeliveryError, VkNewsClient } from './vk-news.client';

describe('NewsPublicationService', () => {
  let article: Partial<NewsEntity>;
  let job: NewsPublicationEntity | null;
  let service: NewsPublicationService;
  let vk: {
    [K in 'requireConnection' | 'image' | 'uploadPhoto' | 'post']: jest.Mock;
  };
  let access: { article: jest.Mock };
  const actor = { id: 12 };
  beforeEach(() => {
    article = {
      id: 1,
      communityId: 7,
      status: 'published',
      title: 'Итоги тура',
      slug: 'results',
      vkText: 'Читайте подробности',
      vkImageUrl: null,
    };
    job = null;
    access = { article: jest.fn(async () => article) };
    vk = {
      requireConnection: jest.fn(() => ({
        groupId: '123',
        articleOrigin: 'https://liga-dvora.ru',
      })),
      image: jest.fn(async () => Buffer.from('image')),
      uploadPhoto: jest.fn(async () => 'photo-123_1'),
      post: jest.fn(async () => 'https://vk.com/wall-123_99'),
    };
    const newsRepo = {
      findOneOrFail: jest.fn(async () => article),
      findOneBy: jest.fn(async () =>
        article.status === 'published' ? article : null,
      ),
    };
    const publicationRepo = {
      findOneBy: jest.fn(async () => job),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => {
        job = { id: 1, ...v };
        return job;
      }),
      update: jest.fn(async (_id, values) => {
        Object.assign(job!, values);
      }),
      createQueryBuilder: jest.fn(() => builder),
    };
    const builder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => (job?.status === 'queued' ? job : null)),
    };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === NewsEntity ? newsRepo : publicationRepo,
    };
    const db = {
      ...manager,
      query: jest.fn(async () => []),
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    service = new NewsPublicationService(
      db as unknown as DataSource,
      access as unknown as NewsAccessService,
      vk as unknown as VkNewsClient,
    );
  });

  it('queues once with a frozen payload and UTM link, without making an external post', async () => {
    const first = await service.enqueue(1, actor);
    article.vkText = 'Изменённый анонс';
    article.slug = 'changed';
    const second = await service.enqueue(1, actor);
    expect(second).toBe(first);
    expect(second.message).toContain('Читайте подробности');
    expect(second.message).not.toContain('Изменённый');
    expect(second.articleUrl).toBe(
      'https://liga-dvora.ru/news/results?utm_source=vk&utm_medium=social&utm_campaign=news_1',
    );
    expect(second.requestedByUserId).toBe(12);
    expect(vk.post).not.toHaveBeenCalled();
  });

  it('rejects unpublished articles and empty teasers', async () => {
    article.status = 'draft';
    await expect(service.enqueue(1, actor)).rejects.toThrow(
      'Сначала опубликуйте',
    );
    article.status = 'published';
    article.vkText = ' ';
    await expect(service.enqueue(1, actor)).rejects.toThrow('текст анонса');
  });

  it('does not enqueue or disclose status without community access', async () => {
    access.article.mockRejectedValue(new Error('Недостаточно прав'));
    await expect(service.enqueue(1, actor)).rejects.toThrow(
      'Недостаточно прав',
    );
    await expect(service.status(1, actor)).rejects.toThrow('Недостаточно прав');
    expect(job).toBeNull();
  });

  it('publishes a claimed job and records the confirmed URL', async () => {
    await service.enqueue(1, actor);
    await service.tick();
    expect(job!.status).toBe('published');
    expect(job!.postUrl).toBe('https://vk.com/wall-123_99');
    expect(job!.publishedAt).toBeInstanceOf(Date);
    await service.tick();
    expect(vk.post).toHaveBeenCalledTimes(1);
  });

  it('uploads an optional photo before wall.post', async () => {
    article.vkImageUrl =
      '/uploads/news/00000000-0000-0000-0000-000000000000.jpg';
    await service.enqueue(1, actor);
    await service.tick();
    expect(vk.uploadPhoto).toHaveBeenCalledWith('123', article.vkImageUrl);
    expect(vk.post).toHaveBeenCalledWith(
      '123',
      expect.any(String),
      expect.any(String),
      'photo-123_1',
    );
  });

  it('does not send a job whose article has been unpublished', async () => {
    await service.enqueue(1, actor);
    article.status = 'draft';
    await service.tick();
    expect(job!.status).toBe('failed');
    expect(vk.post).not.toHaveBeenCalled();
  });

  it('bounds automatic retries on explicit safe failures', async () => {
    vk.post.mockRejectedValue(new VkDeliveryError('Лимит', true));
    await service.enqueue(1, actor);
    await service.tick();
    expect(job!.status).toBe('queued');
    expect(job!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await service.tick();
    await service.tick();
    expect(job!.status).toBe('failed');
    expect(job!.attempts).toBe(3);
  });

  it('never auto-retries unknown results; manual retry requires absence confirmation and retains guid', async () => {
    vk.post.mockRejectedValue(new VkDeliveryError('Timeout', false, true));
    await service.enqueue(1, actor);
    await service.tick();
    expect(job!.status).toBe('unknown');
    await service.tick();
    expect(vk.post).toHaveBeenCalledTimes(1);
    await expect(service.retry(1, actor, false)).rejects.toThrow(
      'подтвердите отсутствие',
    );
    const guid = job!.guid;
    const message = job!.message;
    await service.retry(1, { id: 13 }, true);
    expect(job!.guid).toBe(guid);
    expect(job!.message).toBe(message);
    expect(job!.status).toBe('queued');
    expect(job!.lastRequestedByUserId).toBe(13);
  });

  it('does not reset successful jobs on retry requests', async () => {
    await service.enqueue(1, actor);
    await service.tick();
    await service.retry(1, actor, true);
    expect(job!.status).toBe('published');
    expect(vk.post).toHaveBeenCalledTimes(1);
  });

  it('does not leak unexpected upstream errors into the persisted status', async () => {
    vk.uploadPhoto.mockRejectedValue(new Error('secret-token'));
    article.vkImageUrl =
      '/uploads/news/00000000-0000-0000-0000-000000000000.jpg';
    await service.enqueue(1, actor);
    await service.tick();
    expect(job!.errorMessage).not.toContain('secret');
    expect(job!.status).toBe('failed');
  });
});
