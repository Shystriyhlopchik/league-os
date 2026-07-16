import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateLegacyTournaments1784164450000
  implements MigrationInterface
{
  name = 'MigrateLegacyTournaments1784164450000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "legacy_tournament_migration_audit" (
        "tournament_id" integer NOT NULL,
        "stage_id" integer,
        "rule_version_id" integer,
        "previous_active_rule_version_id" integer,
        "previous_lifecycle_status" character varying(32),
        "legacy_max_match_id" integer NOT NULL DEFAULT 0,
        "legacy_match_count" integer NOT NULL DEFAULT 0,
        "legacy_participant_count" integer NOT NULL DEFAULT 0,
        "standings_before" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "standings_after" jsonb,
        "stats_before" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "stats_after" jsonb,
        "data_equivalent" boolean,
        "migrated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_legacy_tournament_migration_audit" PRIMARY KEY ("tournament_id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "legacy_tournament_migration_audit" (
        "tournament_id",
        "previous_active_rule_version_id",
        "previous_lifecycle_status",
        "legacy_max_match_id",
        "legacy_match_count",
        "legacy_participant_count",
        "standings_before",
        "stats_before"
      )
      SELECT
        tournament."id",
        tournament."active_rule_version_id",
        tournament."lifecycle_status"::text,
        COALESCE((
          SELECT MAX(match."id")
          FROM "matches" match
          WHERE match."tournament_id" = tournament."id"
        ), 0),
        (
          SELECT COUNT(*)::integer
          FROM "matches" match
          WHERE match."tournament_id" = tournament."id"
        ),
        (
          SELECT COUNT(*)::integer
          FROM "tournament_teams" tournament_team
          WHERE tournament_team."tournament_id" = tournament."id"
        ),
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'teamId', standing."team_id",
              'position', standing."position",
              'played', standing."played",
              'wins', standing."wins",
              'draws', standing."draws",
              'losses', standing."losses",
              'goalsFor', standing."goalsFor",
              'goalsAgainst', standing."goalsAgainst",
              'goalDifference', standing."goalDifference",
              'points', standing."points"
            )
            ORDER BY standing."team_id"
          )
          FROM "standings" standing
          WHERE standing."tournament_id" = tournament."id"
            AND standing."stage_id" IS NULL
        ), '[]'::jsonb),
        jsonb_build_object(
          'matches', (
            SELECT COUNT(*) FROM "matches" match
            WHERE match."tournament_id" = tournament."id"
          ),
          'finished', (
            SELECT COUNT(*) FROM "matches" match
            WHERE match."tournament_id" = tournament."id"
              AND match."status" = 'finished'
          ),
          'homeGoals', (
            SELECT COALESCE(SUM(match."home_score"), 0)
            FROM "matches" match
            WHERE match."tournament_id" = tournament."id"
              AND match."status" = 'finished'
          ),
          'awayGoals', (
            SELECT COALESCE(SUM(match."away_score"), 0)
            FROM "matches" match
            WHERE match."tournament_id" = tournament."id"
              AND match."status" = 'finished'
          ),
          'events', (
            SELECT COUNT(*)
            FROM "match_events" event
            INNER JOIN "matches" match ON match."id" = event."match_id"
            WHERE match."tournament_id" = tournament."id"
              AND event."is_cancelled" = false
          )
        )
      FROM "tournaments" tournament
      WHERE NOT EXISTS (
        SELECT 1
        FROM "tournament_stages" stage
        WHERE stage."tournament_id" = tournament."id"
      )
      ON CONFLICT ("tournament_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "tournament_stages" (
        "tournament_id",
        "key",
        "name",
        "type",
        "order",
        "status",
        "start_date",
        "end_date",
        "configuration"
      )
      SELECT
        tournament."id",
        'legacy-main',
        CASE
          WHEN tournament."format"::text = 'knockout' THEN 'Плей-офф'
          WHEN EXISTS (
            SELECT 1
            FROM "tournament_teams" grouped_team
            WHERE grouped_team."tournament_id" = tournament."id"
              AND NULLIF(trim(grouped_team."groupName"), '') IS NOT NULL
          ) THEN 'Групповой этап'
          ELSE 'Основной этап'
        END,
        CASE
          WHEN tournament."format"::text = 'knockout'
            THEN 'knockout'::"public"."tournament_stage_type_enum"
          WHEN EXISTS (
            SELECT 1
            FROM "tournament_teams" grouped_team
            WHERE grouped_team."tournament_id" = tournament."id"
              AND NULLIF(trim(grouped_team."groupName"), '') IS NOT NULL
          ) THEN 'group_stage'::"public"."tournament_stage_type_enum"
          ELSE 'round_robin'::"public"."tournament_stage_type_enum"
        END,
        1,
        CASE tournament."status"::text
          WHEN 'active' THEN 'active'::"public"."tournament_stage_status_enum"
          WHEN 'finished' THEN 'completed'::"public"."tournament_stage_status_enum"
          WHEN 'cancelled' THEN 'completed'::"public"."tournament_stage_status_enum"
          ELSE 'pending'::"public"."tournament_stage_status_enum"
        END,
        tournament."startDate",
        tournament."endDate",
        jsonb_build_object(
          'legacyMigration', true,
          'migrationVersion', 1784164450000,
          'sourceFormat', tournament."format"
        )
      FROM "legacy_tournament_migration_audit" audit
      INNER JOIN "tournaments" tournament
        ON tournament."id" = audit."tournament_id"
      WHERE audit."stage_id" IS NULL
      ON CONFLICT ("tournament_id", "key") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "legacy_tournament_migration_audit" audit
      SET "stage_id" = stage."id"
      FROM "tournament_stages" stage
      WHERE stage."tournament_id" = audit."tournament_id"
        AND stage."key" = 'legacy-main'
        AND stage."configuration" @> '{"legacyMigration":true,"migrationVersion":1784164450000}'::jsonb
    `);

    await queryRunner.query(`
      INSERT INTO "tournament_groups" (
        "stage_id",
        "key",
        "name",
        "order",
        "capacity",
        "status"
      )
      SELECT
        grouped."stage_id",
        'legacy-' || grouped."group_order",
        grouped."group_name",
        grouped."group_order",
        CASE WHEN grouped."team_count" >= 2 THEN grouped."team_count" ELSE NULL END,
        CASE
          WHEN grouped."stage_status" = 'completed'
            THEN 'completed'::"public"."tournament_group_status_enum"
          ELSE 'confirmed'::"public"."tournament_group_status_enum"
        END
      FROM (
        SELECT
          audit."stage_id",
          trim(tournament_team."groupName") AS "group_name",
          dense_rank() OVER (
            PARTITION BY audit."stage_id"
            ORDER BY trim(tournament_team."groupName")
          )::integer AS "group_order",
          COUNT(*)::integer AS "team_count",
          stage."status"::text AS "stage_status"
        FROM "legacy_tournament_migration_audit" audit
        INNER JOIN "tournament_stages" stage ON stage."id" = audit."stage_id"
        INNER JOIN "tournament_teams" tournament_team
          ON tournament_team."tournament_id" = audit."tournament_id"
        WHERE stage."type" = 'group_stage'
          AND NULLIF(trim(tournament_team."groupName"), '') IS NOT NULL
        GROUP BY
          audit."stage_id",
          trim(tournament_team."groupName"),
          stage."status"
      ) grouped
      ON CONFLICT ("stage_id", "key") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "tournament_rule_versions" (
        "tournament_id",
        "version",
        "schema_version",
        "config",
        "status",
        "published_at",
        "change_summary"
      )
      SELECT
        tournament."id",
        (
          SELECT COALESCE(MAX(version."version"), 0) + 1
          FROM "tournament_rule_versions" version
          WHERE version."tournament_id" = tournament."id"
        ),
        1,
        jsonb_build_object(
          'schemaVersion', 1,
          'stages', jsonb_build_array(
            CASE
              WHEN stage."type"::text = 'knockout' THEN
                jsonb_build_object(
                  'stageKey', stage."key",
                  'type', 'knockout',
                  'bracket', jsonb_build_object(
                    'size', CASE
                      WHEN audit."legacy_participant_count" <= 2 THEN 2
                      WHEN audit."legacy_participant_count" <= 4 THEN 4
                      WHEN audit."legacy_participant_count" <= 8 THEN 8
                      WHEN audit."legacy_participant_count" <= 16 THEN 16
                      ELSE 32
                    END,
                    'seeding', jsonb_build_object('type', 'manual')
                  ),
                  'match', jsonb_build_object(
                    'periods', 2,
                    'periodDurationMinutes', NULL,
                    'allowDraw', false,
                    'extraTime', jsonb_build_object('enabled', false),
                    'penalties', jsonb_build_object(
                      'enabled', true,
                      'initialKicksPerTeam', 5,
                      'suddenDeath', true
                    )
                  ),
                  'discipline', jsonb_build_object(
                    'accumulatedYellows', jsonb_build_object(
                      'enabled', true,
                      'threshold', 4,
                      'suspensionMatches', 1,
                      'progression', 'reset_after_suspension'
                    ),
                    'secondYellowInMatch', jsonb_build_object(
                      'enabled', true,
                      'minimumMatches', 1,
                      'allowManualExtension', true
                    ),
                    'directRed', jsonb_build_object(
                      'enabled', true,
                      'minimumMatches', 1,
                      'allowManualExtension', true
                    ),
                    'stageTransition', jsonb_build_object(
                      'carryYellowCards', true,
                      'carryPendingSuspensions', true
                    )
                  )
                )
              WHEN stage."type"::text = 'group_stage' THEN
                jsonb_build_object(
                  'stageKey', stage."key",
                  'type', 'group_stage',
                  'groups', jsonb_build_object(
                    'count', (
                      SELECT COUNT(*)
                      FROM "tournament_groups" tournament_group
                      WHERE tournament_group."stage_id" = stage."id"
                    )
                  ),
                  'schedule', jsonb_build_object(
                    'algorithm', 'circle',
                    'legs', 1,
                    'balanceHomeAway', true
                  ),
                  'scoring', jsonb_build_object('win', 3, 'draw', 1, 'loss', 0),
                  'standings', jsonb_build_object(
                    'tieBreakers', jsonb_build_array(
                      jsonb_build_object('type', 'goal_difference', 'scope', 'all_matches'),
                      jsonb_build_object('type', 'goals_for', 'scope', 'all_matches'),
                      jsonb_build_object('type', 'draw')
                    )
                  ),
                  'match', jsonb_build_object(
                    'periods', 2,
                    'periodDurationMinutes', NULL,
                    'allowDraw', true,
                    'extraTime', jsonb_build_object('enabled', false),
                    'penalties', jsonb_build_object('enabled', false)
                  ),
                  'discipline', jsonb_build_object(
                    'accumulatedYellows', jsonb_build_object(
                      'enabled', true,
                      'threshold', 4,
                      'suspensionMatches', 1,
                      'progression', 'reset_after_suspension'
                    ),
                    'secondYellowInMatch', jsonb_build_object(
                      'enabled', true,
                      'minimumMatches', 1,
                      'allowManualExtension', true
                    ),
                    'directRed', jsonb_build_object(
                      'enabled', true,
                      'minimumMatches', 1,
                      'allowManualExtension', true
                    ),
                    'stageTransition', jsonb_build_object(
                      'carryYellowCards', true,
                      'carryPendingSuspensions', true
                    )
                  )
                )
              ELSE
                jsonb_build_object(
                  'stageKey', stage."key",
                  'type', 'round_robin',
                  'schedule', jsonb_build_object(
                    'algorithm', 'circle',
                    'legs', 1,
                    'balanceHomeAway', true
                  ),
                  'scoring', jsonb_build_object('win', 3, 'draw', 1, 'loss', 0),
                  'standings', jsonb_build_object(
                    'tieBreakers', jsonb_build_array(
                      jsonb_build_object('type', 'goal_difference', 'scope', 'all_matches'),
                      jsonb_build_object('type', 'goals_for', 'scope', 'all_matches'),
                      jsonb_build_object('type', 'draw')
                    )
                  ),
                  'match', jsonb_build_object(
                    'periods', 2,
                    'periodDurationMinutes', NULL,
                    'allowDraw', true,
                    'extraTime', jsonb_build_object('enabled', false),
                    'penalties', jsonb_build_object('enabled', false)
                  ),
                  'discipline', jsonb_build_object(
                    'accumulatedYellows', jsonb_build_object(
                      'enabled', true,
                      'threshold', 4,
                      'suspensionMatches', 1,
                      'progression', 'reset_after_suspension'
                    ),
                    'secondYellowInMatch', jsonb_build_object(
                      'enabled', true,
                      'minimumMatches', 1,
                      'allowManualExtension', true
                    ),
                    'directRed', jsonb_build_object(
                      'enabled', true,
                      'minimumMatches', 1,
                      'allowManualExtension', true
                    ),
                    'stageTransition', jsonb_build_object(
                      'carryYellowCards', true,
                      'carryPendingSuspensions', true
                    )
                  )
                )
            END
          ),
          'transitions', jsonb_build_array()
        ),
        'published'::"public"."tournament_rule_version_status_enum",
        COALESCE(tournament."startDate"::timestamp, tournament."createdAt"),
        'Legacy bootstrap by migration 1784164450000'
      FROM "legacy_tournament_migration_audit" audit
      INNER JOIN "tournaments" tournament
        ON tournament."id" = audit."tournament_id"
      INNER JOIN "tournament_stages" stage
        ON stage."id" = audit."stage_id"
      WHERE audit."rule_version_id" IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "tournament_rule_versions" version
          WHERE version."tournament_id" = tournament."id"
            AND version."change_summary" = 'Legacy bootstrap by migration 1784164450000'
        )
    `);

    await queryRunner.query(`
      UPDATE "legacy_tournament_migration_audit" audit
      SET "rule_version_id" = version."id"
      FROM "tournament_rule_versions" version
      WHERE version."tournament_id" = audit."tournament_id"
        AND version."change_summary" = 'Legacy bootstrap by migration 1784164450000'
    `);

    await queryRunner.query(`
      UPDATE "tournaments" tournament
      SET
        "active_rule_version_id" = COALESCE(
          tournament."active_rule_version_id",
          audit."rule_version_id"
        ),
        "lifecycle_status" = COALESCE(
          tournament."lifecycle_status",
          CASE tournament."status"::text
            WHEN 'active' THEN 'in_progress'::"public"."tournament_lifecycle_status_enum"
            WHEN 'finished' THEN 'completed'::"public"."tournament_lifecycle_status_enum"
            WHEN 'cancelled' THEN 'completed'::"public"."tournament_lifecycle_status_enum"
            ELSE 'published'::"public"."tournament_lifecycle_status_enum"
          END
        )
      FROM "legacy_tournament_migration_audit" audit
      WHERE audit."tournament_id" = tournament."id"
    `);

    await queryRunner.query(`
      INSERT INTO "tournament_stage_participants" (
        "stage_id",
        "tournament_team_id",
        "group_id",
        "seed_number",
        "qualification_source",
        "status"
      )
      SELECT
        audit."stage_id",
        tournament_team."id",
        tournament_group."id",
        tournament_team."seedNumber",
        'legacy_migration',
        CASE tournament_team."status"::text
          WHEN 'withdrawn' THEN 'withdrawn'::"public"."tournament_stage_participant_status_enum"
          WHEN 'disqualified' THEN 'eliminated'::"public"."tournament_stage_participant_status_enum"
          ELSE 'active'::"public"."tournament_stage_participant_status_enum"
        END
      FROM "legacy_tournament_migration_audit" audit
      INNER JOIN "tournament_teams" tournament_team
        ON tournament_team."tournament_id" = audit."tournament_id"
      LEFT JOIN "tournament_groups" tournament_group
        ON tournament_group."stage_id" = audit."stage_id"
        AND tournament_group."name" = trim(tournament_team."groupName")
      ON CONFLICT ("stage_id", "tournament_team_id") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "matches" match
      SET
        "stage_id" = audit."stage_id",
        "group_id" = COALESCE(
          match."group_id",
          CASE
            WHEN stage."type" = 'group_stage' THEN (
              SELECT home_participant."group_id"
              FROM "tournament_stage_participants" home_participant
              INNER JOIN "tournament_teams" home_tournament_team
                ON home_tournament_team."id" = home_participant."tournament_team_id"
              INNER JOIN "tournament_stage_participants" away_participant
                ON away_participant."stage_id" = home_participant."stage_id"
              INNER JOIN "tournament_teams" away_tournament_team
                ON away_tournament_team."id" = away_participant."tournament_team_id"
              WHERE home_participant."stage_id" = audit."stage_id"
                AND home_tournament_team."team_id" = match."home_team_id"
                AND away_tournament_team."team_id" = match."away_team_id"
                AND away_participant."group_id" = home_participant."group_id"
              LIMIT 1
            )
            ELSE NULL
          END
        ),
        "effective_rule_version_id" = COALESCE(
          match."effective_rule_version_id",
          audit."rule_version_id"
        ),
        "round_type" = COALESCE(
          match."round_type",
          CASE
            WHEN stage."type"::text <> 'knockout'
              THEN 'round_robin'::"public"."match_round_type_enum"
            WHEN lower(COALESCE(match."round", '')) LIKE '%third%'
              OR lower(COALESCE(match."round", '')) LIKE '%за 3%'
              THEN 'third_place'::"public"."match_round_type_enum"
            WHEN lower(COALESCE(match."round", '')) LIKE '%semi%'
              OR lower(COALESCE(match."round", '')) LIKE '%полу%'
              THEN 'semi_final'::"public"."match_round_type_enum"
            WHEN lower(COALESCE(match."round", '')) LIKE '%quarter%'
              OR lower(COALESCE(match."round", '')) LIKE '%четвер%'
              THEN 'quarter_final'::"public"."match_round_type_enum"
            WHEN lower(COALESCE(match."round", '')) LIKE '%final%'
              OR lower(COALESCE(match."round", '')) LIKE '%финал%'
              THEN 'final'::"public"."match_round_type_enum"
            ELSE 'round_of_16'::"public"."match_round_type_enum"
          END
        ),
        "round_number" = COALESCE(
          match."round_number",
          GREATEST(
            NULLIF(substring(COALESCE(match."round", '') FROM '[0-9]+'), '')::integer,
            1
          ),
          1
        )
      FROM "legacy_tournament_migration_audit" audit
      INNER JOIN "tournament_stages" stage ON stage."id" = audit."stage_id"
      WHERE match."tournament_id" = audit."tournament_id"
        AND match."stage_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "standings" standing
      SET
        "stage_id" = audit."stage_id",
        "group_id" = COALESCE(
          standing."group_id",
          (
            SELECT participant."group_id"
            FROM "tournament_stage_participants" participant
            INNER JOIN "tournament_teams" tournament_team
              ON tournament_team."id" = participant."tournament_team_id"
            WHERE participant."stage_id" = audit."stage_id"
              AND tournament_team."team_id" = standing."team_id"
            LIMIT 1
          )
        ),
        "rule_version_id" = COALESCE(
          standing."rule_version_id",
          audit."rule_version_id"
        )
      FROM "legacy_tournament_migration_audit" audit
      WHERE standing."tournament_id" = audit."tournament_id"
        AND standing."stage_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "player_suspensions" suspension
      SET "stage_id" = audit."stage_id"
      FROM "legacy_tournament_migration_audit" audit
      WHERE suspension."tournament_id" = audit."tournament_id"
        AND suspension."stage_id" IS NULL
        AND suspension."status" = 'active'
    `);

    await queryRunner.query(`
      UPDATE "legacy_tournament_migration_audit" audit
      SET
        "standings_after" = COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'teamId', standing."team_id",
              'position', standing."position",
              'played', standing."played",
              'wins', standing."wins",
              'draws', standing."draws",
              'losses', standing."losses",
              'goalsFor', standing."goalsFor",
              'goalsAgainst', standing."goalsAgainst",
              'goalDifference', standing."goalDifference",
              'points', standing."points"
            )
            ORDER BY standing."team_id"
          )
          FROM "standings" standing
          WHERE standing."tournament_id" = audit."tournament_id"
            AND standing."stage_id" = audit."stage_id"
        ), '[]'::jsonb),
        "stats_after" = jsonb_build_object(
          'matches', (
            SELECT COUNT(*) FROM "matches" match
            WHERE match."tournament_id" = audit."tournament_id"
          ),
          'finished', (
            SELECT COUNT(*) FROM "matches" match
            WHERE match."tournament_id" = audit."tournament_id"
              AND match."status" = 'finished'
          ),
          'homeGoals', (
            SELECT COALESCE(SUM(match."home_score"), 0)
            FROM "matches" match
            WHERE match."tournament_id" = audit."tournament_id"
              AND match."status" = 'finished'
          ),
          'awayGoals', (
            SELECT COALESCE(SUM(match."away_score"), 0)
            FROM "matches" match
            WHERE match."tournament_id" = audit."tournament_id"
              AND match."status" = 'finished'
          ),
          'events', (
            SELECT COUNT(*)
            FROM "match_events" event
            INNER JOIN "matches" match ON match."id" = event."match_id"
            WHERE match."tournament_id" = audit."tournament_id"
              AND event."is_cancelled" = false
          )
        )
    `);

    await queryRunner.query(`
      UPDATE "legacy_tournament_migration_audit"
      SET "data_equivalent" =
        "standings_before" = "standings_after"
        AND "stats_before" = "stats_after"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "legacy_tournament_migration_audit" audit
          INNER JOIN "matches" match ON match."stage_id" = audit."stage_id"
          WHERE match."id" > audit."legacy_max_match_id"
        ) THEN
          RAISE EXCEPTION 'Rollback blocked: migrated stages contain matches created after migration';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      UPDATE "player_suspensions" suspension
      SET "stage_id" = NULL
      FROM "legacy_tournament_migration_audit" audit
      WHERE suspension."stage_id" = audit."stage_id"
    `);
    await queryRunner.query(`
      UPDATE "standings" standing
      SET "stage_id" = NULL, "group_id" = NULL, "rule_version_id" = NULL
      FROM "legacy_tournament_migration_audit" audit
      WHERE standing."stage_id" = audit."stage_id"
    `);
    await queryRunner.query(`
      UPDATE "matches" match
      SET
        "stage_id" = NULL,
        "group_id" = NULL,
        "effective_rule_version_id" = NULL,
        "round_type" = NULL,
        "round_number" = NULL
      FROM "legacy_tournament_migration_audit" audit
      WHERE match."stage_id" = audit."stage_id"
        AND match."id" <= audit."legacy_max_match_id"
    `);
    await queryRunner.query(`
      DELETE FROM "tournament_stage_participants" participant
      USING "legacy_tournament_migration_audit" audit
      WHERE participant."stage_id" = audit."stage_id"
        AND participant."qualification_source" = 'legacy_migration'
    `);
    await queryRunner.query(`
      UPDATE "tournaments" tournament
      SET
        "active_rule_version_id" = audit."previous_active_rule_version_id",
        "lifecycle_status" =
          audit."previous_lifecycle_status"::"public"."tournament_lifecycle_status_enum"
      FROM "legacy_tournament_migration_audit" audit
      WHERE tournament."id" = audit."tournament_id"
    `);
    await queryRunner.query(`
      DELETE FROM "tournament_rule_versions" version
      USING "legacy_tournament_migration_audit" audit
      WHERE version."id" = audit."rule_version_id"
        AND version."change_summary" = 'Legacy bootstrap by migration 1784164450000'
    `);
    await queryRunner.query(`
      DELETE FROM "tournament_stages" stage
      USING "legacy_tournament_migration_audit" audit
      WHERE stage."id" = audit."stage_id"
        AND stage."configuration" @> '{"legacyMigration":true,"migrationVersion":1784164450000}'::jsonb
    `);
    await queryRunner.query(
      `DROP TABLE "legacy_tournament_migration_audit"`,
    );
  }
}
