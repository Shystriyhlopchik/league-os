import { MigrationInterface, QueryRunner } from 'typeorm';

export class TournamentApplications1792540800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const base =
      'id SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now()';
    await q.query(
      'ALTER TABLE communities ADD "isDefault" boolean NOT NULL DEFAULT false',
    );
    await q.query(
      `UPDATE communities SET "isDefault" = true WHERE slug = 'dvorovaya-liga'`,
    );
    await q.query(
      'CREATE UNIQUE INDEX "UQ_community_default" ON communities ("isDefault") WHERE "isDefault" = true',
    );
    await q.query(`CREATE TABLE community_teams (${base},
      community_id int NOT NULL REFERENCES communities(id), team_id int NOT NULL REFERENCES teams(id),
      "isActive" boolean NOT NULL DEFAULT true, UNIQUE(community_id, team_id))`);
    await q.query(`INSERT INTO community_teams(community_id, team_id)
      SELECT c.id, t.id FROM communities c CROSS JOIN teams t WHERE c."isDefault"`);
    await q.query(`CREATE FUNCTION register_default_community_team() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO community_teams(community_id, team_id) SELECT id, NEW.id FROM communities WHERE "isDefault" AND "isActive";
        RETURN NEW;
      END $$`);
    await q.query(
      'CREATE TRIGGER teams_default_community AFTER INSERT ON teams FOR EACH ROW EXECUTE FUNCTION register_default_community_team()',
    );
    await q.query(
      'ALTER TABLE team_players ADD community_id int REFERENCES communities(id)',
    );
    await q.query(
      'UPDATE team_players SET community_id = (SELECT id FROM communities WHERE "isDefault")',
    );
    await q.query(
      'ALTER TABLE team_players ALTER COLUMN community_id SET NOT NULL',
    );
    // Do not silently pick a team or destroy history if legacy affiliations conflict.
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM team_players WHERE "isActive" GROUP BY community_id, player_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Duplicate active player affiliations. Resolve team_players duplicates before migration; no player records have been merged.';
      END IF;
    END $$`);
    await q.query(
      'CREATE UNIQUE INDEX "UQ_team_players_community_active" ON team_players(community_id, player_id) WHERE "isActive" = true',
    );
    await q.query(`CREATE FUNCTION default_team_player_community() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.community_id IS NULL THEN SELECT id INTO NEW.community_id FROM communities WHERE "isDefault" AND "isActive"; END IF;
        IF NEW."isActive" AND NOT EXISTS (SELECT 1 FROM community_teams WHERE community_id = NEW.community_id AND team_id = NEW.team_id AND "isActive") THEN
          RAISE EXCEPTION 'Team does not belong to community';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(
      'CREATE TRIGGER team_players_community BEFORE INSERT OR UPDATE ON team_players FOR EACH ROW EXECUTE FUNCTION default_team_player_community()',
    );
    await q.query(`ALTER TABLE tournaments ADD registration_required boolean NOT NULL DEFAULT false,
      ADD registration_status varchar NOT NULL DEFAULT 'not_open' CHECK(registration_status IN ('not_open','open','closed')),
      ADD registration_policy jsonb, ADD registration_opened_at timestamptz`);
    await q.query(`CREATE TABLE tournament_applications (${base},
      tournament_id int NOT NULL REFERENCES tournaments(id), team_id int NOT NULL REFERENCES teams(id),
      status varchar NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','changes_requested','approved')),
      current_revision_id int, approved_revision_id int, UNIQUE(tournament_id, team_id))`);
    await q.query(`CREATE TABLE tournament_application_revisions (${base},
      application_id int NOT NULL REFERENCES tournament_applications(id), version int NOT NULL,
      created_by_user_id int NOT NULL REFERENCES users(id), snapshot jsonb NOT NULL, policy jsonb NOT NULL,
      UNIQUE(application_id, version))`);
    await q.query(`ALTER TABLE tournament_applications
      ADD FOREIGN KEY(current_revision_id) REFERENCES tournament_application_revisions(id),
      ADD FOREIGN KEY(approved_revision_id) REFERENCES tournament_application_revisions(id)`);
    await q.query(`CREATE TABLE tournament_application_events (${base},
      application_id int NOT NULL REFERENCES tournament_applications(id), revision_id int NOT NULL REFERENCES tournament_application_revisions(id),
      actor_user_id int NOT NULL REFERENCES users(id), action varchar NOT NULL, comment text)`);
    await q.query(`CREATE TABLE tournament_roster_players (${base}, tournament_id int NOT NULL REFERENCES tournaments(id),
      tournament_team_id int NOT NULL REFERENCES tournament_teams(id), team_id int NOT NULL REFERENCES teams(id),
      player_id int NOT NULL REFERENCES players(id), team_player_id int NOT NULL REFERENCES team_players(id),
      revision_id int NOT NULL REFERENCES tournament_application_revisions(id), "shirtNumber" int, position varchar,
      "isCaptain" boolean NOT NULL, "isActive" boolean NOT NULL DEFAULT true)`);
    await q.query(
      'CREATE UNIQUE INDEX "UQ_tournament_roster_active_player" ON tournament_roster_players(tournament_id, player_id) WHERE "isActive" = true',
    );
    await q.query(`CREATE TABLE community_transfer_requests (${base}, community_id int NOT NULL REFERENCES communities(id),
      player_id int NOT NULL REFERENCES players(id), from_team_id int REFERENCES teams(id), to_team_id int NOT NULL REFERENCES teams(id),
      requested_by_user_id int NOT NULL REFERENCES users(id), "shirtNumber" int NOT NULL CHECK("shirtNumber" BETWEEN 1 AND 99),
      status varchar NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      reviewed_by_user_id int REFERENCES users(id), comment text)`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_community_transfer_pending" ON community_transfer_requests(community_id,player_id,to_team_id) WHERE status = 'pending'`,
    );
    await q.query('ALTER TABLE tournament_members ALTER role DROP DEFAULT');
    await q.query(
      'ALTER TABLE tournament_members ALTER role TYPE varchar USING role::text',
    );
    await q.query(
      `ALTER TABLE tournament_members ALTER role SET DEFAULT 'organizer', ADD CONSTRAINT tournament_member_role_check CHECK(role IN ('admin','organizer','viewer'))`,
    );
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'This migration retains approved rosters and transfer history. Restore the pre-migration backup to roll back.',
      ),
    );
  }
}
