import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityVideos1792886400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE videos (
      id SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      community_id int NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      title varchar(180) NOT NULL, embed_url text NOT NULL, cover_url varchar,
      status varchar NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
      show_on_home boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 9999),
      published_at timestamptz, tournament_id int REFERENCES tournaments(id) ON DELETE SET NULL,
      match_id int REFERENCES matches(id) ON DELETE SET NULL, deleted_at timestamptz,
      CHECK (status <> 'published' OR (cover_url IS NOT NULL AND published_at IS NOT NULL))
    )`);
    await q.query(`CREATE INDEX "IDX_videos_home" ON videos(community_id,sort_order,published_at DESC,id DESC)
      WHERE status='published' AND show_on_home=true AND deleted_at IS NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE videos');
  }
}
