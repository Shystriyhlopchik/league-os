INSERT INTO "competitions" ("id", "name", "slug")
VALUES (900001, 'Migration E2E', 'migration-e2e');

INSERT INTO "seasons" ("id", "competition_id", "name", "slug", "year")
VALUES (900001, 900001, 'Migration E2E 2026', 'migration-e2e-2026', 2026);

INSERT INTO "teams" ("id", "name", "shortName", "slug")
VALUES
  (900001, 'Legacy Alpha', 'Alpha', 'migration-e2e-alpha'),
  (900002, 'Legacy Beta', 'Beta', 'migration-e2e-beta');

INSERT INTO "players" ("id", "firstName", "lastName", "slug")
VALUES (900001, 'Legacy', 'Suspended', 'migration-e2e-player');

INSERT INTO "tournaments" (
  "id", "season_id", "name", "slug", "type", "format", "status"
)
VALUES (
  900001, 900001, 'Legacy migration E2E', 'legacy-migration-e2e',
  'league', 'round_robin', 'active'
);

INSERT INTO "tournament_teams" (
  "id", "tournament_id", "team_id", "seedNumber", "status"
)
VALUES
  (900001, 900001, 900001, 1, 'active'),
  (900002, 900001, 900002, 2, 'active');

INSERT INTO "matches" (
  "id", "tournament_id", "home_team_id", "away_team_id",
  "round", "status", "home_score", "away_score"
)
VALUES (900001, 900001, 900001, 900002, '1', 'finished', 2, 1);

INSERT INTO "standings" (
  "id", "tournament_id", "team_id", "position", "played", "wins",
  "draws", "losses", "goalsFor", "goalsAgainst", "goalDifference", "points"
)
VALUES
  (900001, 900001, 900001, 1, 1, 1, 0, 0, 2, 1, 1, 3),
  (900002, 900001, 900002, 2, 1, 0, 0, 1, 1, 2, -1, 0);

INSERT INTO "player_tournament_stats" (
  "id", "tournament_id", "team_id", "player_id", "yellow_cards",
  "is_suspended", "suspension_reason"
)
VALUES (
  900001, 900001, 900001, 900001, 4, true, 'four_yellow_cards'
);

INSERT INTO "player_suspensions" (
  "id", "tournament_id", "player_id", "team_id", "reason",
  "matches_required", "matches_served", "status"
)
VALUES (
  900001, 900001, 900001, 900001, 'accumulated_yellows', 1, 0, 'active'
);
