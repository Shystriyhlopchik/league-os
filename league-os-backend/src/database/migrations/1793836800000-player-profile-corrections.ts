import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlayerProfileCorrections1793836800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE players ADD COLUMN identity_version int NOT NULL DEFAULT 1',
    );
    await q.query(
      'ALTER TABLE match_roster_players ADD COLUMN identity_snapshot jsonb',
    );
    await q.query(`CREATE TABLE player_profile_changes (
      id SERIAL PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
      player_id int NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      community_id int NOT NULL REFERENCES communities(id) ON DELETE RESTRICT,
      team_id int REFERENCES teams(id) ON DELETE RESTRICT,
      requested_by_user_id int NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      base_version int NOT NULL, "before" jsonb NOT NULL, "after" jsonb NOT NULL, reason text NOT NULL,
      status varchar NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','changes_requested')),
      reviewed_by_user_id int REFERENCES users(id) ON DELETE RESTRICT, reviewed_at timestamptz, comment text
    )`);
    await q.query(
      'CREATE UNIQUE INDEX "UQ_player_profile_pending" ON player_profile_changes(player_id) WHERE status = \'submitted\'',
    );
    await q.query(
      'CREATE INDEX "IDX_profile_changes_community" ON player_profile_changes(community_id, id DESC)',
    );
    await q.query(`CREATE TABLE player_profile_audit (
      id SERIAL PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
      player_id int NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      community_id int NOT NULL REFERENCES communities(id) ON DELETE RESTRICT,
      actor_user_id int NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      change_id int REFERENCES player_profile_changes(id) ON DELETE RESTRICT,
      action varchar NOT NULL, "before" jsonb NOT NULL, "after" jsonb NOT NULL, reason text NOT NULL
    )`);
    await q.query(
      'CREATE INDEX "IDX_profile_audit_player" ON player_profile_audit(player_id, id DESC)',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE player_profile_audit');
    await q.query('DROP TABLE player_profile_changes');
    await q.query(
      'ALTER TABLE match_roster_players DROP COLUMN identity_snapshot',
    );
    await q.query('ALTER TABLE players DROP COLUMN identity_version');
  }
}
