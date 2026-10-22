import { MigrationInterface, QueryRunner } from 'typeorm';

export class Communities1792454400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE communities (
      id SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), name varchar NOT NULL,
      slug varchar NOT NULL UNIQUE, "isActive" boolean NOT NULL DEFAULT true
    )`);
    await q.query(`CREATE TABLE community_members (
      id SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      community_id integer NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role varchar(16) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      "isActive" boolean NOT NULL DEFAULT true,
      CONSTRAINT "UQ_community_members_community_user" UNIQUE(community_id, user_id)
    )`);
    await q.query(
      `CREATE INDEX "IDX_community_members_user" ON community_members(user_id)`,
    );
    await q.query(`CREATE TABLE community_access_audit (
      id SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      community_id integer NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      actor_user_id integer, target_user_id integer NOT NULL,
      previous_role varchar, new_role varchar, source varchar NOT NULL DEFAULT 'web'
    )`);
    await q.query(
      `CREATE INDEX "IDX_community_audit_history" ON community_access_audit(community_id, id)`,
    );
    await q.query(
      `INSERT INTO communities(name, slug) VALUES ('Дворовая лига', 'dvorovaya-liga')`,
    );
    await q.query(`ALTER TABLE competitions ADD community_id integer`);
    await q.query(
      `UPDATE competitions SET community_id = (SELECT id FROM communities WHERE slug = 'dvorovaya-liga')`,
    );
    await q.query(
      `ALTER TABLE competitions ALTER COLUMN community_id SET NOT NULL`,
    );
    await q.query(
      `ALTER TABLE competitions ADD CONSTRAINT "FK_competitions_community" FOREIGN KEY (community_id) REFERENCES communities(id)`,
    );
    await q.query(
      `CREATE INDEX "IDX_competitions_community" ON competitions(community_id)`,
    );
    // Preserve existing global roles; new community roles never create global roles.
    await q.query(`INSERT INTO community_members(community_id, user_id, role)
      SELECT c.id, u.id,
        CASE WHEN bool_or(r.code::text = 'super_admin') THEN 'owner' ELSE 'admin' END
      FROM users u JOIN user_roles ur ON ur."usersId" = u.id
      JOIN roles r ON r.id = ur."rolesId" CROSS JOIN communities c
      WHERE r.code::text IN ('admin', 'super_admin') AND u."isActive" = true
        AND c.slug = 'dvorovaya-liga'
      GROUP BY c.id, u.id`);
    await q.query(`INSERT INTO community_members(community_id, user_id, role)
      SELECT DISTINCT c.id, u.id, 'member'
      FROM users u CROSS JOIN communities c
      WHERE c.slug = 'dvorovaya-liga' AND (
        EXISTS (SELECT 1 FROM tournaments t WHERE t.owner_user_id = u.id)
        OR EXISTS (SELECT 1 FROM tournament_members m WHERE m.user_id = u.id)
      ) ON CONFLICT (community_id, user_id) DO NOTHING`);
    await q.query(`INSERT INTO tournament_members(tournament_id, user_id, role)
      SELECT t.id, t.owner_user_id, 'organizer' FROM tournaments t
      WHERE t.owner_user_id IS NOT NULL
      ON CONFLICT (tournament_id, user_id) DO NOTHING`);
    await q.query(`INSERT INTO community_access_audit(community_id, target_user_id, new_role, source)
      SELECT community_id, user_id, role, 'migration' FROM community_members`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE competitions DROP CONSTRAINT "FK_competitions_community"`,
    );
    await q.query(`ALTER TABLE competitions DROP COLUMN community_id`);
    await q.query(`DROP TABLE community_access_audit`);
    await q.query(`DROP TABLE community_members`);
    await q.query(`DROP TABLE communities`);
  }
}
