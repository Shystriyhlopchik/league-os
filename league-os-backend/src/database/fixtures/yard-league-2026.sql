-- Creates the published 2026 Yard League tournament structure without teams,
-- participants, matches or organizers.
--
-- The script is safe to run again: if the tournament slug already exists,
-- it exits without changing the published rules.

BEGIN;

DO $seed$
DECLARE
  v_owner_id integer;
  v_competition_id integer;
  v_season_id integer;
  v_tournament_id integer;
  v_group_stage_id integer;
  v_playoff_stage_id integer;
  v_rule_version_id integer;
BEGIN
  SELECT id
  INTO v_owner_id
  FROM users
  WHERE username = 'shystrik';

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'User "shystrik" was not found. Create the user before running this script.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tournaments
    WHERE slug = 'dvorovaya-liga-2026'
  ) THEN
    RAISE NOTICE 'Tournament dvorovaya-liga-2026 already exists; no changes were made.';
    RETURN;
  END IF;

  SELECT id
  INTO v_competition_id
  FROM competitions
  WHERE slug = 'dvorovaya-liga';

  IF v_competition_id IS NULL THEN
    INSERT INTO competitions (
      name,
      slug,
      description,
      "isActive"
    )
    VALUES (
      'Дворовая лига',
      'dvorovaya-liga',
      'Турнир по дворовому футболу.',
      true
    )
    RETURNING id INTO v_competition_id;
  END IF;

  SELECT id
  INTO v_season_id
  FROM seasons AS season
  WHERE season.competition_id = v_competition_id
    AND season.slug = 'dvorovaya-liga-2026'
  ORDER BY id
  LIMIT 1;

  IF v_season_id IS NULL THEN
    INSERT INTO seasons (
      competition_id,
      name,
      slug,
      year,
      "startDate",
      "endDate",
      status,
      "isActive"
    )
    VALUES (
      v_competition_id,
      'Сезон 2026',
      'dvorovaya-liga-2026',
      2026,
      DATE '2026-07-21',
      NULL,
      'planned',
      true
    )
    RETURNING id INTO v_season_id;
  END IF;

  INSERT INTO tournaments (
    season_id,
    name,
    slug,
    description,
    type,
    format,
    "startDate",
    "endDate",
    status,
    "isActive",
    owner_user_id,
    lifecycle_status
  )
  VALUES (
    v_season_id,
    'Дворовая лига',
    'dvorovaya-liga-2026',
    '16 команд: группы 6/5/5, затем полуфиналы, матч за третье место и финал.',
    'league',
    'mixed',
    DATE '2026-07-21',
    NULL,
    'planned',
    true,
    v_owner_id,
    'published'
  )
  RETURNING id INTO v_tournament_id;

  INSERT INTO tournament_stages (
    tournament_id,
    key,
    name,
    type,
    "order",
    status,
    start_date,
    end_date,
    configuration
  )
  VALUES (
    v_tournament_id,
    'groups',
    'Групповой этап',
    'group_stage',
    1,
    'pending',
    DATE '2026-07-21',
    DATE '2026-09-01',
    '{
      "schemaVersion": 1,
      "type": "group_stage",
      "groupsCount": 3,
      "groupSizes": [6, 5, 5],
      "legs": 2
    }'::jsonb
  )
  RETURNING id INTO v_group_stage_id;

  INSERT INTO tournament_stages (
    tournament_id,
    key,
    name,
    type,
    "order",
    status,
    start_date,
    end_date,
    configuration
  )
  VALUES (
    v_tournament_id,
    'playoff',
    'Суперфинал',
    'knockout',
    2,
    'pending',
    NULL,
    NULL,
    '{
      "schemaVersion": 1,
      "type": "knockout",
      "bracketSize": 4,
      "thirdPlaceMatch": true
    }'::jsonb
  )
  RETURNING id INTO v_playoff_stage_id;

  INSERT INTO tournament_groups (
    stage_id,
    key,
    name,
    "order",
    capacity,
    status
  )
  VALUES
    (v_group_stage_id, 'A', 'Группа А', 1, 6, 'draft'),
    (v_group_stage_id, 'B', 'Группа Б', 2, 5, 'draft'),
    (v_group_stage_id, 'C', 'Группа В', 3, 5, 'draft');

  INSERT INTO tournament_rule_versions (
    tournament_id,
    version,
    schema_version,
    config,
    status,
    published_at,
    created_by_user_id,
    published_by_user_id,
    change_summary
  )
  VALUES (
    v_tournament_id,
    1,
    1,
    $rules$
    {
      "schemaVersion": 1,
      "stages": [
        {
          "stageKey": "groups",
          "type": "group_stage",
          "groups": {
            "count": 3,
            "groupSizes": [6, 5, 5]
          },
          "schedule": {
            "algorithm": "circle",
            "legs": 2,
            "balanceHomeAway": true
          },
          "scoring": {
            "win": 3,
            "draw": 1,
            "loss": 0
          },
          "standings": {
            "tieBreakers": [
              { "type": "technical_loss", "order": "asc" },
              {
                "type": "head_to_head",
                "metrics": ["points", "wins", "goal_difference", "goals_for"],
                "reapplyAfterReduction": true
              },
              { "type": "wins", "scope": "all_matches" },
              { "type": "goal_difference", "scope": "all_matches" },
              { "type": "goals_for", "scope": "all_matches" },
              { "type": "draw" }
            ]
          },
          "match": {
            "periods": 2,
            "periodDurationMinutes": 20,
            "allowDraw": true,
            "extraTime": { "enabled": false },
            "penalties": { "enabled": false }
          },
          "discipline": {
            "accumulatedYellows": {
              "enabled": true,
              "threshold": 3,
              "suspensionMatches": 1,
              "progression": "every_card_after_threshold"
            },
            "secondYellowInMatch": {
              "enabled": true,
              "minimumMatches": 1,
              "allowManualExtension": true
            },
            "directRed": {
              "enabled": true,
              "minimumMatches": 1,
              "allowManualExtension": true
            },
            "stageTransition": {
              "carryYellowCards": false,
              "carryPendingSuspensions": false
            }
          }
        },
        {
          "stageKey": "playoff",
          "type": "knockout",
          "bracket": {
            "size": 4,
            "placementMatch": "third_place",
            "seeding": {
              "type": "best_eligible_opponent",
              "protectedQualificationRuleId": "best-second",
              "candidateQualificationRuleId": "group-winners",
              "candidateRanking": {
                "criteria": ["points", "goal_difference", "goals_for", "draw_lots"]
              },
              "constraints": [
                {
                  "type": "avoid_same_source_group",
                  "mode": "best_effort"
                }
              ],
              "remaining": "pair_in_ranking_order"
            }
          },
          "match": {
            "periods": 2,
            "periodDurationMinutes": 20,
            "allowDraw": false,
            "extraTime": { "enabled": false },
            "penalties": {
              "enabled": true,
              "initialKicksPerTeam": 5,
              "suddenDeath": true
            }
          },
          "discipline": {
            "accumulatedYellows": {
              "enabled": true,
              "threshold": 3,
              "suspensionMatches": 1,
              "progression": "every_card_after_threshold"
            },
            "secondYellowInMatch": {
              "enabled": true,
              "minimumMatches": 1,
              "allowManualExtension": true
            },
            "directRed": {
              "enabled": true,
              "minimumMatches": 1,
              "allowManualExtension": true
            },
            "stageTransition": {
              "carryYellowCards": false,
              "carryPendingSuspensions": false
            }
          }
        }
      ],
      "transitions": [
        {
          "fromStageKey": "groups",
          "toStageKey": "playoff",
          "confirmationRequired": true,
          "qualification": [
            {
              "id": "group-winners",
              "type": "group_winners"
            },
            {
              "id": "best-second",
              "type": "best_placed_teams_between_groups",
              "sourcePosition": 2,
              "count": 1,
              "ranking": {
                "criteria": ["points", "goal_difference", "goals_for", "draw_lots"]
              }
            }
          ],
          "crossGroupComparison": {
            "unequalGroups": {
              "type": "exclude_matches_against_last_placed"
            }
          }
        }
      ]
    }
    $rules$::jsonb,
    'published',
    CURRENT_TIMESTAMP,
    v_owner_id,
    v_owner_id,
    'Начальная опубликованная версия правил Дворовой лиги 2026.'
  )
  RETURNING id INTO v_rule_version_id;

  UPDATE tournaments
  SET active_rule_version_id = v_rule_version_id
  WHERE id = v_tournament_id;

  RAISE NOTICE
    'Created tournament %, group stage %, playoff stage %, rule version %.',
    v_tournament_id,
    v_group_stage_id,
    v_playoff_stage_id,
    v_rule_version_id;
END
$seed$;

COMMIT;
