-- Adds the 16 Yard League teams to the published 2026 tournament and assigns
-- them to groups A, B and C. The script does not create players or matches.
--
-- Run yard-league-2026.sql before this script.

BEGIN;

DO $seed$
DECLARE
  v_tournament_id integer;
  v_group_stage_id integer;
  v_group_id integer;
  v_team_id integer;
  v_tournament_team_id integer;
  v_participant_count integer;
  v_group_count integer;
  v_team_index integer;

  v_names text[] := ARRAY[
    'ЖБК-9',
    'Арман',
    'Полено',
    'Дизель',
    'Альгешево',
    'Цезарь',
    'Торпедо',
    'КРИКС',
    'FIRE',
    'ЧГСД',
    'Соляное',
    'ЧЭТК',
    'ЧТСиГХ',
    'ХБК',
    'Водоканал',
    'Коробка'
  ];

  v_slugs text[] := ARRAY[
    'zhbk-9',
    'arman',
    'poleno',
    'dizel',
    'algeshevo',
    'tsezar',
    'torpedo',
    'kriks',
    'fire',
    'chgsd',
    'solyanoe',
    'chetk',
    'chtsigh',
    'hbk',
    'vodokanal',
    'korobka'
  ];

  v_group_keys text[] := ARRAY[
    'A', 'A', 'A', 'A', 'A', 'A',
    'B', 'B', 'B', 'B', 'B',
    'C', 'C', 'C', 'C', 'C'
  ];

  v_group_seeds integer[] := ARRAY[
    1, 2, 3, 4, 5, 6,
    1, 2, 3, 4, 5,
    1, 2, 3, 4, 5
  ];
BEGIN
  SELECT tournament.id
  INTO v_tournament_id
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

  FOR v_team_index IN 1..array_length(v_names, 1) LOOP
    SELECT tournament_group.id
    INTO v_group_id
    FROM tournament_groups AS tournament_group
    WHERE tournament_group.stage_id = v_group_stage_id
      AND tournament_group.key = v_group_keys[v_team_index];

    IF v_group_id IS NULL THEN
      RAISE EXCEPTION
        'Group % was not found for stage %.',
        v_group_keys[v_team_index],
        v_group_stage_id;
    END IF;

    INSERT INTO teams (
      name,
      "shortName",
      slug,
      description,
      "isActive"
    )
    VALUES (
      v_names[v_team_index],
      v_names[v_team_index],
      v_slugs[v_team_index],
      'Участник турнира «Дворовая лига» 2026.',
      true
    )
    ON CONFLICT (slug) DO UPDATE
    SET
      name = EXCLUDED.name,
      "shortName" = EXCLUDED."shortName",
      "isActive" = true
    RETURNING id INTO v_team_id;

    SELECT tournament_team.id
    INTO v_tournament_team_id
    FROM tournament_teams AS tournament_team
    WHERE tournament_team.tournament_id = v_tournament_id
      AND tournament_team.team_id = v_team_id
    ORDER BY tournament_team.id
    LIMIT 1;

    IF v_tournament_team_id IS NULL THEN
      INSERT INTO tournament_teams (
        tournament_id,
        team_id,
        "groupName",
        "seedNumber",
        status
      )
      VALUES (
        v_tournament_id,
        v_team_id,
        v_group_keys[v_team_index],
        v_team_index,
        'active'
      )
      RETURNING id INTO v_tournament_team_id;
    ELSE
      UPDATE tournament_teams
      SET
        "groupName" = v_group_keys[v_team_index],
        "seedNumber" = v_team_index,
        status = 'active'
      WHERE id = v_tournament_team_id;
    END IF;

    INSERT INTO tournament_stage_participants (
      stage_id,
      tournament_team_id,
      group_id,
      seed_number,
      qualification_source,
      status
    )
    VALUES (
      v_group_stage_id,
      v_tournament_team_id,
      v_group_id,
      v_group_seeds[v_team_index],
      'initial_registration',
      'active'
    )
    ON CONFLICT (stage_id, tournament_team_id) DO UPDATE
    SET
      group_id = EXCLUDED.group_id,
      seed_number = EXCLUDED.seed_number,
      qualification_source = EXCLUDED.qualification_source,
      status = EXCLUDED.status;
  END LOOP;

  SELECT count(*)
  INTO v_participant_count
  FROM tournament_stage_participants AS participant
  WHERE participant.stage_id = v_group_stage_id;

  IF v_participant_count <> 16 THEN
    RAISE EXCEPTION
      'Expected 16 group-stage participants, found %. No changes were committed.',
      v_participant_count;
  END IF;

  SELECT count(*)
  INTO v_group_count
  FROM tournament_stage_participants AS participant
  INNER JOIN tournament_groups AS tournament_group
    ON tournament_group.id = participant.group_id
  WHERE participant.stage_id = v_group_stage_id
    AND tournament_group.key = 'A';

  IF v_group_count <> 6 THEN
    RAISE EXCEPTION 'Expected 6 teams in group A, found %.', v_group_count;
  END IF;

  SELECT count(*)
  INTO v_group_count
  FROM tournament_stage_participants AS participant
  INNER JOIN tournament_groups AS tournament_group
    ON tournament_group.id = participant.group_id
  WHERE participant.stage_id = v_group_stage_id
    AND tournament_group.key = 'B';

  IF v_group_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 teams in group B, found %.', v_group_count;
  END IF;

  SELECT count(*)
  INTO v_group_count
  FROM tournament_stage_participants AS participant
  INNER JOIN tournament_groups AS tournament_group
    ON tournament_group.id = participant.group_id
  WHERE participant.stage_id = v_group_stage_id
    AND tournament_group.key = 'C';

  IF v_group_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 teams in group C, found %.', v_group_count;
  END IF;

  UPDATE tournament_groups
  SET
    name = CASE key
      WHEN 'A' THEN 'Группа А'
      WHEN 'B' THEN 'Группа Б'
      WHEN 'C' THEN 'Группа В'
      ELSE name
    END,
    status = 'confirmed'
  WHERE stage_id = v_group_stage_id
    AND key IN ('A', 'B', 'C');

  RAISE NOTICE
    'Assigned 16 teams to Yard League 2026: group A = 6, B = 5, C = 5.';
END
$seed$;

COMMIT;
