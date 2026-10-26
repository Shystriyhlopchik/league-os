import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { NewsVkPublication1792972800000 } from '../../database/migrations/1792972800000-news-vk-publication';
import { NewsAccessService } from './news-access.service';
import { NewsPublicationService } from './news-publication.service';
import { VkNewsClient } from './vk-news.client';

// Opt-in, disposable DB only. Never read POSTGRES_* or a project's .env for this test.
const testUrl = process.env.VK_CHECK_DATABASE_URL;
const postgresDescribe = testUrl ? describe : describe.skip;

postgresDescribe('VK publication on disposable PostgreSQL', () => {
  let db: DataSource;
  const migration = new NewsVkPublication1792972800000();
  const vk = {
    requireConnection: () => ({
      groupId: '123',
      articleOrigin: 'https://liga-dvora.ru',
    }),
    validatePreviewImage: jest.fn(),
    post: jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'https://vk.com/wall-123_1';
    }),
  };
  const access = { article: jest.fn(async () => ({})) };
  const worker = () =>
    new NewsPublicationService(
      db,
      access as unknown as NewsAccessService,
      vk as unknown as VkNewsClient,
    );

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (
      url.pathname !== '/league_os_vk_check' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      ['5432', '5433', ''].includes(url.port)
    )
      throw new Error(
        'Only an explicitly isolated local league_os_vk_check database on a nonstandard port is allowed',
      );
    db = await new DataSource({
      type: 'postgres',
      url: testUrl,
      entities: [join(__dirname, '../../**/*.entity.ts')],
      synchronize: false,
    }).initialize();
    await db.query(`CREATE TABLE communities(id serial PRIMARY KEY, "isDefault" boolean);
      INSERT INTO communities VALUES (7, true);
      CREATE TABLE users(id serial PRIMARY KEY); INSERT INTO users VALUES (12);
      CREATE TABLE news(id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        title varchar NOT NULL, slug varchar UNIQUE NOT NULL, excerpt text, content text NOT NULL, "coverUrl" varchar,
        status varchar NOT NULL, "publishedAt" timestamp, author_user_id int, updated_by_user_id int, deleted_at timestamp);
      INSERT INTO news(id,title,slug,content,status) VALUES (1,'Черновик','draft','Текст','draft'), (2,'Итоги','results','Статья','published')`);
    const runner = db.createQueryRunner();
    try {
      await migration.up(runner);
    } finally {
      await runner.release();
    }
  }, 20000);

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('backfills the community and locks previously published URLs', async () => {
    expect(
      await db.query('SELECT community_id, slug_locked FROM news ORDER BY id'),
    ).toEqual([
      { community_id: 7, slug_locked: false },
      { community_id: 7, slug_locked: true },
    ]);
  });

  it('enqueues once under concurrent requests, then lets only one worker send', async () => {
    await db.query("UPDATE news SET vk_text='Анонс' WHERE id=2");
    const jobs = await Promise.all(
      Array.from({ length: 8 }, () => worker().enqueue(2, { id: 12 })),
    );
    expect(new Set(jobs.map((job) => job.id)).size).toBe(1);
    expect(
      (
        await db.query('SELECT count(*)::int AS count FROM news_publications')
      )[0].count,
    ).toBe(1);
    await Promise.all([worker().tick(), worker().tick()]);
    expect(vk.post).toHaveBeenCalledTimes(1);
    expect(
      (await db.query('SELECT status, post_url FROM news_publications'))[0],
    ).toEqual({ status: 'published', post_url: 'https://vk.com/wall-123_1' });
  });

  it('recovers an interrupted sending job without creating a duplicate', async () => {
    await db.query(
      "UPDATE news_publications SET status='sending', started_at=now() - interval '4 minutes'",
    );
    await worker().tick();
    expect(
      (await db.query('SELECT status FROM news_publications'))[0].status,
    ).toBe('unknown');
    expect(vk.post).toHaveBeenCalledTimes(1);
  });

  it('can roll back the new schema without deleting existing articles', async () => {
    const runner = db.createQueryRunner();
    try {
      await migration.down(runner);
    } finally {
      await runner.release();
    }
    expect(
      (await db.query('SELECT count(*)::int AS count FROM news'))[0].count,
    ).toBe(2);
  });
});
