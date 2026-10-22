DELETE FROM "player_suspensions" WHERE "tournament_id" = 900001;
DELETE FROM "standings" WHERE "tournament_id" = 900001;
DELETE FROM "matches" WHERE "tournament_id" = 900001;
DELETE FROM "tournament_stage_participants"
WHERE "stage_id" IN (
  SELECT "id" FROM "tournament_stages" WHERE "tournament_id" = 900001
);
UPDATE "tournaments"
SET "active_rule_version_id" = NULL
WHERE "id" = 900001;
DELETE FROM "legacy_tournament_migration_audit" WHERE "tournament_id" = 900001;
DELETE FROM "tournament_rule_versions" WHERE "tournament_id" = 900001;
DELETE FROM "tournament_groups"
WHERE "stage_id" IN (
  SELECT "id" FROM "tournament_stages" WHERE "tournament_id" = 900001
);
DELETE FROM "tournament_stages" WHERE "tournament_id" = 900001;
DELETE FROM "player_tournament_stats" WHERE "tournament_id" = 900001;
DELETE FROM "tournament_teams" WHERE "tournament_id" = 900001;
DELETE FROM "tournaments" WHERE "id" = 900001;
DELETE FROM "players" WHERE "id" = 900001;
DELETE FROM "teams" WHERE "id" IN (900001, 900002);
DELETE FROM "seasons" WHERE "id" = 900001;
DELETE FROM "competitions" WHERE "id" = 900001;
