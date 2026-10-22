import { MigrationInterface, QueryRunner } from 'typeorm';

export class TeamSelfService1792627200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const base =
      'id SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now()';
    await q.query(`ALTER TABLE teams
      ADD profile_status varchar NOT NULL DEFAULT 'published' CHECK(profile_status IN ('draft','published')),
      ADD profile_version int NOT NULL DEFAULT 1,
      ADD created_by_user_id int REFERENCES users(id)`);
    await q.query(`CREATE TABLE team_managers (${base}, community_id int NOT NULL REFERENCES communities(id),
      team_id int NOT NULL REFERENCES teams(id), user_id int NOT NULL REFERENCES users(id),
      role varchar NOT NULL CHECK(role IN ('owner','manager')), "isActive" boolean NOT NULL DEFAULT true,
      UNIQUE(community_id,team_id,user_id), FOREIGN KEY(community_id,team_id) REFERENCES community_teams(community_id,team_id))`);
    // Preserve existing captains' access once, independently of future playing-roster changes.
    await q.query(`INSERT INTO team_managers(community_id,team_id,user_id,role)
      SELECT community_id,team_id,user_id, CASE WHEN count(*) OVER(PARTITION BY community_id,team_id) = 1 THEN 'owner' ELSE 'manager' END
      FROM (SELECT DISTINCT tp.community_id,tp.team_id,p.user_id FROM team_players tp
        JOIN players p ON p.id = tp.player_id JOIN users u ON u.id = p.user_id
        WHERE tp."isActive" AND tp."isCaptain" AND p."isActive" AND u."isActive") captains`);
    await q.query(`CREATE TABLE team_access_requests (${base}, community_id int NOT NULL REFERENCES communities(id),
      team_id int NOT NULL REFERENCES teams(id), user_id int NOT NULL REFERENCES users(id), reason text NOT NULL,
      status varchar NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      reviewed_by_user_id int REFERENCES users(id), comment text,
      FOREIGN KEY(community_id,team_id) REFERENCES community_teams(community_id,team_id))`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_team_access_pending" ON team_access_requests(community_id,team_id,user_id) WHERE status = 'pending'`,
    );
    await q.query(`CREATE TABLE team_management_audit (${base}, community_id int NOT NULL REFERENCES communities(id),
      team_id int NOT NULL REFERENCES teams(id), actor_user_id int REFERENCES users(id), target_user_id int REFERENCES users(id),
      action varchar NOT NULL, comment text)`);
    await q.query(`INSERT INTO team_management_audit(community_id,team_id,target_user_id,action,comment)
      SELECT community_id,team_id,user_id,'legacy_access_preserved',role FROM team_managers`);
    await q.query(`INSERT INTO community_members(community_id,user_id,role,"isActive")
      SELECT DISTINCT community_id,user_id,'member',true FROM team_managers ON CONFLICT(community_id,user_id) DO NOTHING`);
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Restore the pre-migration backup to roll back without losing team ownership and access history.',
      ),
    );
  }
}
