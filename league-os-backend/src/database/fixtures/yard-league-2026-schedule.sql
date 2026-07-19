-- Creates the three Yard League venues and the complete two-leg group schedule
-- (70 matches). Run yard-league-2026.sql and yard-league-2026-teams.sql first.

BEGIN;

DO $prepare$
DECLARE
  v_tournament_id integer;
  v_group_stage_id integer;
  v_owner_id integer;
  v_current_rule_id integer;
  v_current_rule_version integer;
  v_current_config jsonb;
  v_group_legs integer;
  v_new_rule_id integer;
  v_new_rule_version integer;
  v_new_config jsonb;
BEGIN
  SELECT
    tournament.id,
    tournament.owner_user_id,
    tournament.active_rule_version_id
  INTO
    v_tournament_id,
    v_owner_id,
    v_current_rule_id
  FROM tournaments AS tournament
  WHERE tournament.slug = 'dvorovaya-liga-2026'
  ORDER BY tournament.id
  LIMIT 1;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION
      'Tournament dvorovaya-liga-2026 was not found. Run yard-league-2026.sql first.';
  END IF;

  SELECT stage.id
  INTO v_group_stage_id
  FROM tournament_stages AS stage
  WHERE stage.tournament_id = v_tournament_id
    AND stage.key = 'groups';

  IF v_group_stage_id IS NULL THEN
    RAISE EXCEPTION 'The groups stage was not found for tournament %.', v_tournament_id;
  END IF;

  IF v_current_rule_id IS NULL THEN
    RAISE EXCEPTION 'Tournament % has no active rule version.', v_tournament_id;
  END IF;

  SELECT rule_version.version, rule_version.config
  INTO v_current_rule_version, v_current_config
  FROM tournament_rule_versions AS rule_version
  WHERE rule_version.id = v_current_rule_id
    AND rule_version.tournament_id = v_tournament_id;

  IF v_current_config IS NULL THEN
    RAISE EXCEPTION 'Active rule version % was not found.', v_current_rule_id;
  END IF;

  SELECT (stage_rule.value -> 'schedule' ->> 'legs')::integer
  INTO v_group_legs
  FROM jsonb_array_elements(v_current_config -> 'stages') AS stage_rule(value)
  WHERE stage_rule.value ->> 'stageKey' = 'groups';

  IF v_group_legs IS NULL THEN
    RAISE EXCEPTION 'The groups rule was not found in rule version %.', v_current_rule_id;
  END IF;

  -- The supplied calendar contains home and away fixtures. If the active
  -- published rule still says one leg, preserve it and publish a new version.
  IF v_group_legs <> 2 THEN
    SELECT jsonb_set(
      v_current_config,
      '{stages}',
      jsonb_agg(
        CASE
          WHEN stage_rule.value ->> 'stageKey' = 'groups'
          THEN jsonb_set(stage_rule.value, '{schedule,legs}', '2'::jsonb, false)
          ELSE stage_rule.value
        END
        ORDER BY stage_rule.ordinality
      ),
      false
    )
    INTO v_new_config
    FROM jsonb_array_elements(v_current_config -> 'stages')
      WITH ORDINALITY AS stage_rule(value, ordinality);

    SELECT COALESCE(MAX(rule_version.version), 0) + 1
    INTO v_new_rule_version
    FROM tournament_rule_versions AS rule_version
    WHERE rule_version.tournament_id = v_tournament_id;

    INSERT INTO tournament_rule_versions (
      tournament_id,
      version,
      schema_version,
      config,
      status,
      published_at,
      based_on_version_id,
      created_by_user_id,
      published_by_user_id,
      change_summary
    )
    VALUES (
      v_tournament_id,
      v_new_rule_version,
      1,
      v_new_config,
      'published',
      CURRENT_TIMESTAMP,
      v_current_rule_id,
      v_owner_id,
      v_owner_id,
      'Групповой этап изменён на два круга в соответствии с утверждённым календарём.'
    )
    RETURNING id INTO v_new_rule_id;

    UPDATE tournament_rule_versions
    SET status = 'superseded'
    WHERE id = v_current_rule_id;

    UPDATE tournaments
    SET active_rule_version_id = v_new_rule_id
    WHERE id = v_tournament_id;
  END IF;

  UPDATE tournament_stages
  SET configuration = jsonb_set(configuration, '{legs}', '2'::jsonb, true)
  WHERE id = v_group_stage_id;

  INSERT INTO venues (
    name,
    slug,
    description,
    address,
    "isActive"
  )
  VALUES
    (
      'Поле «СОШ №53»',
      'sosh-53',
      'Место проведения матчей группы А Дворовой лиги.',
      'СОШ №53',
      true
    ),
    (
      'Поле «СОШ №65»',
      'sosh-65-novyy-gorod',
      'Место проведения матчей группы Б Дворовой лиги.',
      'мкр-н Новый город',
      true
    ),
    (
      'Поле «Гимназия №5»',
      'gimnaziya-5-volzhskiy-3',
      'Место проведения матчей группы В Дворовой лиги.',
      'мкр-н Волжский-3',
      true
    )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    address = EXCLUDED.address,
    "isActive" = true;
END
$prepare$;

CREATE TEMPORARY TABLE yard_league_schedule (
  group_key text NOT NULL,
  round_number integer NOT NULL,
  match_date date NOT NULL,
  match_time time NOT NULL,
  home_team_slug text NOT NULL,
  away_team_slug text NOT NULL,
  venue_slug text NOT NULL
) ON COMMIT DROP;

INSERT INTO yard_league_schedule (
  group_key,
  round_number,
  match_date,
  match_time,
  home_team_slug,
  away_team_slug,
  venue_slug
)
VALUES
  -- Группа А, поле «СОШ №53».
  ('A', 1, DATE '2026-07-21', TIME '18:30', 'zhbk-9',    'tsezar',     'sosh-53'),
  ('A', 1, DATE '2026-07-21', TIME '19:10', 'arman',     'algeshevo',  'sosh-53'),
  ('A', 1, DATE '2026-07-21', TIME '19:50', 'poleno',    'dizel',      'sosh-53'),
  ('A', 2, DATE '2026-07-23', TIME '18:30', 'algeshevo', 'zhbk-9',     'sosh-53'),
  ('A', 2, DATE '2026-07-23', TIME '19:10', 'tsezar',    'dizel',      'sosh-53'),
  ('A', 2, DATE '2026-07-23', TIME '19:50', 'arman',     'poleno',     'sosh-53'),
  ('A', 3, DATE '2026-07-28', TIME '18:30', 'zhbk-9',    'dizel',      'sosh-53'),
  ('A', 3, DATE '2026-07-28', TIME '19:10', 'algeshevo', 'poleno',     'sosh-53'),
  ('A', 3, DATE '2026-07-28', TIME '19:50', 'tsezar',    'arman',      'sosh-53'),
  ('A', 4, DATE '2026-07-30', TIME '18:30', 'zhbk-9',    'poleno',     'sosh-53'),
  ('A', 4, DATE '2026-07-30', TIME '19:10', 'dizel',     'arman',      'sosh-53'),
  ('A', 4, DATE '2026-07-30', TIME '19:50', 'algeshevo', 'tsezar',     'sosh-53'),
  ('A', 5, DATE '2026-08-04', TIME '18:30', 'zhbk-9',    'arman',      'sosh-53'),
  ('A', 5, DATE '2026-08-04', TIME '19:10', 'poleno',    'tsezar',     'sosh-53'),
  ('A', 5, DATE '2026-08-04', TIME '19:50', 'dizel',     'algeshevo',  'sosh-53'),
  ('A', 6, DATE '2026-08-18', TIME '18:30', 'tsezar',    'zhbk-9',     'sosh-53'),
  ('A', 6, DATE '2026-08-18', TIME '19:10', 'algeshevo', 'arman',      'sosh-53'),
  ('A', 6, DATE '2026-08-18', TIME '19:50', 'dizel',     'poleno',     'sosh-53'),
  ('A', 7, DATE '2026-08-20', TIME '18:30', 'zhbk-9',    'algeshevo',  'sosh-53'),
  ('A', 7, DATE '2026-08-20', TIME '19:10', 'dizel',     'tsezar',     'sosh-53'),
  ('A', 7, DATE '2026-08-20', TIME '19:50', 'poleno',    'arman',      'sosh-53'),
  ('A', 8, DATE '2026-08-25', TIME '18:30', 'dizel',     'zhbk-9',     'sosh-53'),
  ('A', 8, DATE '2026-08-25', TIME '19:10', 'poleno',    'algeshevo',  'sosh-53'),
  ('A', 8, DATE '2026-08-25', TIME '19:50', 'arman',     'tsezar',     'sosh-53'),
  ('A', 9, DATE '2026-08-27', TIME '18:30', 'poleno',    'zhbk-9',     'sosh-53'),
  ('A', 9, DATE '2026-08-27', TIME '19:10', 'arman',     'dizel',      'sosh-53'),
  ('A', 9, DATE '2026-08-27', TIME '19:50', 'tsezar',    'algeshevo',  'sosh-53'),
  ('A',10, DATE '2026-09-01', TIME '18:30', 'arman',     'zhbk-9',     'sosh-53'),
  ('A',10, DATE '2026-09-01', TIME '19:10', 'tsezar',    'poleno',     'sosh-53'),
  ('A',10, DATE '2026-09-01', TIME '19:50', 'algeshevo', 'dizel',      'sosh-53'),

  -- Группа Б, поле «СОШ №65».
  ('B', 1, DATE '2026-07-21', TIME '18:30', 'kriks',    'solyanoe', 'sosh-65-novyy-gorod'),
  ('B', 1, DATE '2026-07-21', TIME '19:10', 'fire',     'chgsd',    'sosh-65-novyy-gorod'),
  ('B', 2, DATE '2026-07-23', TIME '18:30', 'solyanoe', 'torpedo',  'sosh-65-novyy-gorod'),
  ('B', 2, DATE '2026-07-23', TIME '19:10', 'kriks',    'fire',     'sosh-65-novyy-gorod'),
  ('B', 3, DATE '2026-07-28', TIME '18:30', 'torpedo',  'chgsd',    'sosh-65-novyy-gorod'),
  ('B', 3, DATE '2026-07-28', TIME '19:10', 'fire',     'solyanoe', 'sosh-65-novyy-gorod'),
  ('B', 4, DATE '2026-07-30', TIME '18:30', 'torpedo',  'kriks',    'sosh-65-novyy-gorod'),
  ('B', 4, DATE '2026-07-30', TIME '19:10', 'chgsd',    'solyanoe', 'sosh-65-novyy-gorod'),
  ('B', 5, DATE '2026-08-04', TIME '18:30', 'torpedo',  'fire',     'sosh-65-novyy-gorod'),
  ('B', 5, DATE '2026-08-04', TIME '19:10', 'kriks',    'chgsd',    'sosh-65-novyy-gorod'),
  ('B', 6, DATE '2026-08-18', TIME '18:30', 'solyanoe', 'kriks',    'sosh-65-novyy-gorod'),
  ('B', 6, DATE '2026-08-18', TIME '19:10', 'chgsd',    'fire',     'sosh-65-novyy-gorod'),
  ('B', 7, DATE '2026-08-20', TIME '18:30', 'torpedo',  'solyanoe', 'sosh-65-novyy-gorod'),
  ('B', 7, DATE '2026-08-20', TIME '19:10', 'fire',     'kriks',    'sosh-65-novyy-gorod'),
  ('B', 8, DATE '2026-08-25', TIME '18:30', 'chgsd',    'torpedo',  'sosh-65-novyy-gorod'),
  ('B', 8, DATE '2026-08-25', TIME '19:10', 'solyanoe', 'fire',     'sosh-65-novyy-gorod'),
  ('B', 9, DATE '2026-08-27', TIME '18:30', 'kriks',    'torpedo',  'sosh-65-novyy-gorod'),
  ('B', 9, DATE '2026-08-27', TIME '19:10', 'solyanoe', 'chgsd',    'sosh-65-novyy-gorod'),
  ('B',10, DATE '2026-09-01', TIME '18:30', 'fire',     'torpedo',  'sosh-65-novyy-gorod'),
  ('B',10, DATE '2026-09-01', TIME '19:10', 'chgsd',    'kriks',    'sosh-65-novyy-gorod'),

  -- Группа В, поле «Гимназия №5».
  ('C', 1, DATE '2026-07-21', TIME '18:30', 'chtsigh',   'korobka',   'gimnaziya-5-volzhskiy-3'),
  ('C', 1, DATE '2026-07-21', TIME '19:10', 'hbk',       'vodokanal', 'gimnaziya-5-volzhskiy-3'),
  ('C', 2, DATE '2026-07-23', TIME '18:30', 'korobka',   'chetk',     'gimnaziya-5-volzhskiy-3'),
  ('C', 2, DATE '2026-07-23', TIME '19:10', 'chtsigh',   'hbk',       'gimnaziya-5-volzhskiy-3'),
  ('C', 3, DATE '2026-07-28', TIME '18:30', 'chetk',     'vodokanal', 'gimnaziya-5-volzhskiy-3'),
  ('C', 3, DATE '2026-07-28', TIME '19:10', 'hbk',       'korobka',   'gimnaziya-5-volzhskiy-3'),
  ('C', 4, DATE '2026-07-30', TIME '18:30', 'chetk',     'chtsigh',   'gimnaziya-5-volzhskiy-3'),
  ('C', 4, DATE '2026-07-30', TIME '19:10', 'vodokanal', 'korobka',   'gimnaziya-5-volzhskiy-3'),
  ('C', 5, DATE '2026-08-04', TIME '18:30', 'chetk',     'hbk',       'gimnaziya-5-volzhskiy-3'),
  ('C', 5, DATE '2026-08-04', TIME '19:10', 'chtsigh',   'vodokanal', 'gimnaziya-5-volzhskiy-3'),
  ('C', 6, DATE '2026-08-18', TIME '18:30', 'korobka',   'chtsigh',   'gimnaziya-5-volzhskiy-3'),
  ('C', 6, DATE '2026-08-18', TIME '19:10', 'vodokanal', 'hbk',       'gimnaziya-5-volzhskiy-3'),
  ('C', 7, DATE '2026-08-20', TIME '18:30', 'chetk',     'korobka',   'gimnaziya-5-volzhskiy-3'),
  ('C', 7, DATE '2026-08-20', TIME '19:10', 'hbk',       'chtsigh',   'gimnaziya-5-volzhskiy-3'),
  ('C', 8, DATE '2026-08-25', TIME '18:30', 'vodokanal', 'chetk',     'gimnaziya-5-volzhskiy-3'),
  ('C', 8, DATE '2026-08-25', TIME '19:10', 'korobka',   'hbk',       'gimnaziya-5-volzhskiy-3'),
  ('C', 9, DATE '2026-08-27', TIME '18:30', 'chtsigh',   'chetk',     'gimnaziya-5-volzhskiy-3'),
  ('C', 9, DATE '2026-08-27', TIME '19:10', 'korobka',   'vodokanal', 'gimnaziya-5-volzhskiy-3'),
  ('C',10, DATE '2026-09-01', TIME '18:30', 'hbk',       'chetk',     'gimnaziya-5-volzhskiy-3'),
  ('C',10, DATE '2026-09-01', TIME '19:10', 'vodokanal', 'chtsigh',   'gimnaziya-5-volzhskiy-3');

DO $matches$
DECLARE
  v_tournament_id integer;
  v_group_stage_id integer;
  v_active_rule_id integer;
  v_valid_schedule_count integer;
  v_match_count integer;
BEGIN
  SELECT
    tournament.id,
    tournament.active_rule_version_id
  INTO
    v_tournament_id,
    v_active_rule_id
  FROM tournaments AS tournament
  WHERE tournament.slug = 'dvorovaya-liga-2026'
  ORDER BY tournament.id
  LIMIT 1;

  SELECT stage.id
  INTO v_group_stage_id
  FROM tournament_stages AS stage
  WHERE stage.tournament_id = v_tournament_id
    AND stage.key = 'groups';

  IF EXISTS (
    SELECT 1
    FROM matches AS match
    WHERE match.stage_id = v_group_stage_id
      AND match.status <> 'scheduled'
  ) THEN
    RAISE EXCEPTION
      'The group stage already contains a live, finished or cancelled match. Schedule import was cancelled.';
  END IF;

  SELECT count(*)
  INTO v_valid_schedule_count
  FROM yard_league_schedule AS schedule
  INNER JOIN tournament_groups AS tournament_group
    ON tournament_group.stage_id = v_group_stage_id
   AND tournament_group.key = schedule.group_key
  INNER JOIN venues AS venue
    ON venue.slug = schedule.venue_slug
  INNER JOIN teams AS home_team
    ON home_team.slug = schedule.home_team_slug
  INNER JOIN teams AS away_team
    ON away_team.slug = schedule.away_team_slug
  INNER JOIN tournament_teams AS home_tournament_team
    ON home_tournament_team.tournament_id = v_tournament_id
   AND home_tournament_team.team_id = home_team.id
  INNER JOIN tournament_stage_participants AS home_participant
    ON home_participant.stage_id = v_group_stage_id
   AND home_participant.group_id = tournament_group.id
   AND home_participant.tournament_team_id = home_tournament_team.id
  INNER JOIN tournament_teams AS away_tournament_team
    ON away_tournament_team.tournament_id = v_tournament_id
   AND away_tournament_team.team_id = away_team.id
  INNER JOIN tournament_stage_participants AS away_participant
    ON away_participant.stage_id = v_group_stage_id
   AND away_participant.group_id = tournament_group.id
   AND away_participant.tournament_team_id = away_tournament_team.id;

  IF v_valid_schedule_count <> 70 THEN
    RAISE EXCEPTION
      'Expected 70 valid schedule rows, resolved %. Check teams and group assignments.',
      v_valid_schedule_count;
  END IF;

  UPDATE matches AS match
  SET
    venue_id = venue.id,
    match_datetime = schedule.match_date + schedule.match_time,
    round = format('Тур %s', schedule.round_number),
    round_type = 'group_round',
    effective_rule_version_id = v_active_rule_id,
    status = 'scheduled'
  FROM yard_league_schedule AS schedule
  INNER JOIN tournament_groups AS tournament_group
    ON tournament_group.stage_id = v_group_stage_id
   AND tournament_group.key = schedule.group_key
  INNER JOIN venues AS venue
    ON venue.slug = schedule.venue_slug
  INNER JOIN teams AS home_team
    ON home_team.slug = schedule.home_team_slug
  INNER JOIN teams AS away_team
    ON away_team.slug = schedule.away_team_slug
  WHERE match.tournament_id = v_tournament_id
    AND match.stage_id = v_group_stage_id
    AND match.group_id = tournament_group.id
    AND match.round_number = schedule.round_number
    AND match.home_team_id = home_team.id
    AND match.away_team_id = away_team.id;

  INSERT INTO matches (
    tournament_id,
    home_team_id,
    away_team_id,
    venue_id,
    match_datetime,
    round,
    stage_id,
    group_id,
    round_type,
    round_number,
    effective_rule_version_id,
    status
  )
  SELECT
    v_tournament_id,
    home_team.id,
    away_team.id,
    venue.id,
    schedule.match_date + schedule.match_time,
    format('Тур %s', schedule.round_number),
    v_group_stage_id,
    tournament_group.id,
    'group_round',
    schedule.round_number,
    v_active_rule_id,
    'scheduled'
  FROM yard_league_schedule AS schedule
  INNER JOIN tournament_groups AS tournament_group
    ON tournament_group.stage_id = v_group_stage_id
   AND tournament_group.key = schedule.group_key
  INNER JOIN venues AS venue
    ON venue.slug = schedule.venue_slug
  INNER JOIN teams AS home_team
    ON home_team.slug = schedule.home_team_slug
  INNER JOIN teams AS away_team
    ON away_team.slug = schedule.away_team_slug
  WHERE NOT EXISTS (
    SELECT 1
    FROM matches AS existing_match
    WHERE existing_match.tournament_id = v_tournament_id
      AND existing_match.stage_id = v_group_stage_id
      AND existing_match.group_id = tournament_group.id
      AND existing_match.round_number = schedule.round_number
      AND existing_match.home_team_id = home_team.id
      AND existing_match.away_team_id = away_team.id
  );

  SELECT count(*)
  INTO v_match_count
  FROM matches AS match
  WHERE match.stage_id = v_group_stage_id;

  IF v_match_count <> 70 THEN
    RAISE EXCEPTION
      'Expected exactly 70 group-stage matches after import, found %. No changes were committed.',
      v_match_count;
  END IF;

  RAISE NOTICE
    'Created or updated 70 group-stage matches and assigned three venues.';
END
$matches$;

COMMIT;
