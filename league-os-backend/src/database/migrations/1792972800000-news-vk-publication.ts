import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewsVkPublication1792972800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE news ADD community_id integer REFERENCES communities(id), ADD vk_title varchar(180), ADD vk_text text, ADD vk_image_url varchar, ADD slug_locked boolean NOT NULL DEFAULT false',
    );
    await q.query(
      "UPDATE news SET slug_locked = true WHERE status = 'published'",
    );
    await q.query(
      'UPDATE news SET community_id = (SELECT id FROM communities WHERE "isDefault" = true)',
    );
    await q.query('ALTER TABLE news ALTER COLUMN community_id SET NOT NULL');
    await q.query('CREATE INDEX "IDX_news_community" ON news(community_id)');
    await q.query(`CREATE TABLE news_publications (
      id SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      news_id integer NOT NULL REFERENCES news(id), community_id integer NOT NULL REFERENCES communities(id),
      provider varchar NOT NULL DEFAULT 'vk' CHECK (provider = 'vk'), group_id varchar NOT NULL,
      status varchar NOT NULL CHECK (status IN ('queued','sending','published','failed','unknown')),
      message text NOT NULL, article_url text NOT NULL, image_url varchar, guid uuid NOT NULL UNIQUE,
      attempts integer NOT NULL DEFAULT 0, requested_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      last_requested_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      next_attempt_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, published_at timestamptz,
      post_url text, error_message text,
      CONSTRAINT "UQ_news_publications_destination" UNIQUE(news_id, provider)
    )`);
    await q.query(
      'CREATE INDEX "IDX_news_publications_queue" ON news_publications(next_attempt_at, id) WHERE status = \'queued\'',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE news_publications');
    await q.query(
      'ALTER TABLE news DROP community_id, DROP vk_title, DROP vk_text, DROP vk_image_url, DROP slug_locked',
    );
  }
}
