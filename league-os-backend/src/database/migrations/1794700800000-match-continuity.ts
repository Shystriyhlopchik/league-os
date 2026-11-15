import { MigrationInterface, QueryRunner } from 'typeorm';

export class MatchContinuity1794700800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE matches
      ADD COLUMN postponed_at timestamptz,
      ADD COLUMN postponement_reason text,
      ADD COLUMN schedule_revision integer NOT NULL DEFAULT 0,
      ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 1 AND 480),
      ADD COLUMN schedule_history jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await q.query(
      `ALTER TABLE tournaments ADD COLUMN applications_locked_at timestamptz`,
    );
    await q.query(`UPDATE tournaments t SET applications_locked_at = now()
      WHERE t.registration_required AND EXISTS (
        SELECT 1 FROM matches m WHERE m.tournament_id=t.id AND m.round_number>=4
          AND m.round_type IN ('group_round','round_robin') AND m.status<>'cancelled'
          AND (m.status IN ('live','finished') OR m.match_datetime AT TIME ZONE 'Europe/Moscow' <= now())
      )`);
    await q.query(
      `ALTER TABLE match_service_sessions ADD COLUMN revision integer NOT NULL DEFAULT 0`,
    );
    await q.query(`CREATE TABLE match_service_commands (
      id uuid PRIMARY KEY, match_id integer NOT NULL REFERENCES matches(id),
      actor_id integer NOT NULL REFERENCES users(id), request_hash text NOT NULL,
      response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(
      `CREATE INDEX "IDX_match_service_commands_match" ON match_service_commands(match_id)`,
    );
    // Do not rename or merge ambiguous old accounts automatically.
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM users GROUP BY lower(btrim(username)) HAVING count(*)>1)
        OR EXISTS (SELECT 1 FROM users WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*)>1)
        OR EXISTS (SELECT 1 FROM user_auth_accounts WHERE provider='local' AND login IS NOT NULL GROUP BY lower(btrim(login)) HAVING count(*)>1)
        OR EXISTS (SELECT 1 FROM (
          SELECT id AS user_id, lower(btrim(username)) AS login FROM users
          UNION ALL SELECT id, lower(btrim(email)) FROM users WHERE email IS NOT NULL
          UNION ALL SELECT user_id, lower(btrim(login)) FROM user_auth_accounts WHERE provider='local' AND login IS NOT NULL
        ) identities GROUP BY login HAVING count(DISTINCT user_id)>1)
      THEN RAISE EXCEPTION 'Case-insensitive login collisions: audit users and user_auth_accounts before migration'; END IF;
    END $$`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_users_username_canonical" ON users(lower(btrim(username)))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_users_email_canonical" ON users(lower(btrim(email))) WHERE email IS NOT NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_auth_local_login_canonical" ON user_auth_accounts(lower(btrim(login))) WHERE provider='local' AND login IS NOT NULL`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP INDEX "UQ_auth_local_login_canonical", "UQ_users_email_canonical", "UQ_users_username_canonical"`,
    );
    await q.query(`DROP TABLE match_service_commands`);
    await q.query(`ALTER TABLE match_service_sessions DROP COLUMN revision`);
    await q.query(`ALTER TABLE tournaments DROP COLUMN applications_locked_at`);
    await q.query(
      `ALTER TABLE matches DROP COLUMN postponed_at, DROP COLUMN postponement_reason, DROP COLUMN schedule_revision, DROP COLUMN duration_minutes, DROP COLUMN schedule_history`,
    );
  }
}
