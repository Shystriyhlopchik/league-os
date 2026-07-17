-- Removes only the realistic demo data created by realistic-yard-league-demo.sql.
-- Application/runtime code and non-demo records are not affected.

BEGIN;

DO $cleanup$
DECLARE
  demo_tournament_id integer;
BEGIN
  SELECT id
  INTO demo_tournament_id
  FROM tournaments
  WHERE slug = 'demo-yard-league-2026';

  IF demo_tournament_id IS NOT NULL THEN
    UPDATE tournaments
    SET active_rule_version_id = NULL
    WHERE id = demo_tournament_id;

    DELETE FROM tournament_knockout_bracket_plans
    WHERE snapshot_id IN (
      SELECT id
      FROM tournament_knockout_bracket_snapshots
      WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM tournament_knockout_bracket_snapshots
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM tournament_qualification_snapshot_entries
    WHERE snapshot_id IN (
      SELECT id
      FROM tournament_qualification_snapshots
      WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM tournament_qualification_snapshots
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM match_roster_players
    WHERE match_roster_id IN (
      SELECT roster.id
      FROM match_rosters roster
      JOIN matches match ON match.id = roster.match_id
      WHERE match.tournament_id = demo_tournament_id
    );

    DELETE FROM match_rosters
    WHERE match_id IN (
      SELECT id FROM matches WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM match_red_ball_activations
    WHERE match_id IN (
      SELECT id FROM matches WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM match_service_sessions
    WHERE match_id IN (
      SELECT id FROM matches WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM match_events
    WHERE match_id IN (
      SELECT id FROM matches WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM match_officials
    WHERE match_id IN (
      SELECT id FROM matches WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM player_suspensions
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM player_tournament_stats
    WHERE tournament_id = demo_tournament_id;

    IF to_regclass('public.tournament_decisions') IS NOT NULL THEN
      EXECUTE
        'DELETE FROM tournament_decisions WHERE tournament_id = $1'
      USING demo_tournament_id;
    END IF;

    DELETE FROM standings
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM matches
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM tournament_stage_participants
    WHERE stage_id IN (
      SELECT id
      FROM tournament_stages
      WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM tournament_groups
    WHERE stage_id IN (
      SELECT id
      FROM tournament_stages
      WHERE tournament_id = demo_tournament_id
    );

    DELETE FROM tournament_members
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM tournament_teams
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM tournament_rule_versions
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM tournament_stages
    WHERE tournament_id = demo_tournament_id;

    DELETE FROM tournaments
    WHERE id = demo_tournament_id;
  END IF;

  DELETE FROM team_players
  WHERE team_id IN (
    SELECT id FROM teams WHERE slug LIKE 'demo-yard-team-%'
  );

  DELETE FROM players
  WHERE slug LIKE 'demo-yard-player-%';

  DELETE FROM teams
  WHERE slug LIKE 'demo-yard-team-%';

  DELETE FROM venues
  WHERE slug LIKE 'demo-yard-venue-%';

  DELETE FROM news
  WHERE slug LIKE 'demo-yard-news-%';

  DELETE FROM seasons
  WHERE slug = 'demo-yard-season-2026';

  DELETE FROM competitions
  WHERE slug = 'demo-yard-competition';

  DELETE FROM users
  WHERE username IN ('demo_yard_owner', 'demo_yard_organizer');
END
$cleanup$;

COMMIT;
