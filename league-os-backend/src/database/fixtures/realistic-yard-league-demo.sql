-- Realistic demo dataset for league-os.
--
-- Creates:
--   * one competition and one 2026 season;
--   * a two-stage Yard League tournament;
--   * three groups containing six, five and five teams;
--   * twelve players per team;
--   * three venues;
--   * all 35 group-stage fixtures (21 finished, 14 scheduled);
--   * match rosters, officials, goals and disciplinary events;
--   * current group standings;
--   * one active and one served suspension;
--   * an owner, an organizer and public news.
--
-- The script is repeatable. Before inserting data it removes only records whose
-- slugs/usernames use the demo-yard prefix.
--
-- Demo logins (local development only):
--   demo_yard_owner / DemoLeague2026!
--   demo_yard_organizer / DemoLeague2026!
-- Never use these credentials in production.

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

DO $seed$
#variable_conflict use_variable
DECLARE
  competition_id integer;
  season_id integer;
  tournament_id integer;
  group_stage_id integer;
  playoff_stage_id integer;
  rule_version_id integer;
  owner_user_id integer;
  organizer_user_id integer;

  team_id integer;
  tournament_team_id integer;
  group_id integer;
  venue_id integer;
  match_id integer;
  roster_id integer;
  scorer_id integer;
  assist_id integer;
  card_player_id integer;
  suspension_player_id integer;
  suspension_team_id integer;
  suspension_source_match_id integer;
  red_player_id integer;
  red_team_id integer;
  red_source_match_id integer;

  team_index integer;
  player_index integer;
  group_index integer;
  group_slot integer;
  round_index integer;
  pair_index integer;
  pairs_in_round integer;
  group_offset integer;
  event_index integer;
  score_key integer;
  home_slot integer;
  away_slot integer;
  home_team_id integer;
  away_team_id integer;
  home_score integer;
  away_score integer;
  winner_team_id integer;
  loser_team_id integer;
  match_at timestamp;

  group_keys text[] := ARRAY['A', 'B', 'C'];
  team_names text[] := ARRAY[
    'Северный квартал',
    'Маяк',
    'Атлетик',
    'Спутник',
    'Заречье',
    'Олимп',
    'Вымпел',
    'Юность',
    'Факел',
    'Локомотив',
    'Торпедо',
    'Сокол',
    'Дружба',
    'Старт',
    'Ракета',
    'Победа'
  ];
  team_short_names text[] := ARRAY[
    'Северный',
    'Маяк',
    'Атлетик',
    'Спутник',
    'Заречье',
    'Олимп',
    'Вымпел',
    'Юность',
    'Факел',
    'Локо',
    'Торпедо',
    'Сокол',
    'Дружба',
    'Старт',
    'Ракета',
    'Победа'
  ];
  team_slugs text[] := ARRAY[
    'demo-yard-team-severny',
    'demo-yard-team-mayak',
    'demo-yard-team-athletic',
    'demo-yard-team-sputnik',
    'demo-yard-team-zarechye',
    'demo-yard-team-olimp',
    'demo-yard-team-vympel',
    'demo-yard-team-yunost',
    'demo-yard-team-fakel',
    'demo-yard-team-lokomotiv',
    'demo-yard-team-torpedo',
    'demo-yard-team-sokol',
    'demo-yard-team-druzhba',
    'demo-yard-team-start',
    'demo-yard-team-raketa',
    'demo-yard-team-pobeda'
  ];
  primary_colors text[] := ARRAY[
    '#174EA6', '#F9AB00', '#137333', '#9334E6', '#C5221F',
    '#1A73E8', '#E37400', '#188038', '#D93025', '#5F6368',
    '#202124', '#A142F4', '#0B8043', '#3C4043', '#D01884', '#00695C'
  ];
  secondary_colors text[] := ARRAY[
    '#D2E3FC', '#FEF7E0', '#CEEAD6', '#F3E8FD', '#FAD2CF',
    '#E8F0FE', '#FCE8E6', '#E6F4EA', '#FCE8E6', '#E8EAED',
    '#F1F3F4', '#E9D2FD', '#B7E1CD', '#F8F9FA', '#FAD2CF', '#B2DFDB'
  ];
  team_ids integer[] := ARRAY[]::integer[];
  venue_ids integer[] := ARRAY[]::integer[];

  first_names text[] := ARRAY[
    'Александр', 'Максим', 'Иван', 'Дмитрий', 'Артём', 'Михаил',
    'Никита', 'Кирилл', 'Егор', 'Андрей', 'Сергей', 'Роман',
    'Павел', 'Илья', 'Денис', 'Владислав', 'Антон', 'Олег'
  ];
  last_names text[] := ARRAY[
    'Смирнов', 'Иванов', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев',
    'Козлов', 'Новиков', 'Морозов', 'Петров', 'Волков', 'Соловьёв',
    'Васильев', 'Зайцев', 'Павлов', 'Семёнов', 'Голубев', 'Виноградов'
  ];
  shirt_numbers integer[] := ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17];
  home_slots integer[][] := ARRAY[
    [2, 3],
    [1, 2],
    [1, 5],
    [1, 4],
    [1, 4]
  ];
  away_slots integer[][] := ARRAY[
    [5, 4],
    [5, 3],
    [4, 3],
    [3, 2],
    [2, 5]
  ];
  home_slots_six integer[][] := ARRAY[
    [1, 2, 3],
    [1, 6, 2],
    [1, 5, 6],
    [1, 4, 5],
    [1, 3, 4]
  ];
  away_slots_six integer[][] := ARRAY[
    [6, 5, 4],
    [5, 4, 3],
    [4, 3, 2],
    [3, 2, 6],
    [2, 6, 5]
  ];
BEGIN
  INSERT INTO users (
    email,
    username,
    "passwordHash",
    "firstName",
    "lastName",
    phone,
    "isActive"
  )
  VALUES (
    'owner.demo-yard@example.test',
    'demo_yard_owner',
    '$2b$10$CSriuAqj5lVByMkFlSKFPuJF3A5B6lJszJvmM2QUdHxivTyw.fNs2',
    'Алексей',
    'Орлов',
    '+7 900 000-10-01',
    true
  )
  RETURNING id INTO owner_user_id;

  INSERT INTO users (
    email,
    username,
    "passwordHash",
    "firstName",
    "lastName",
    phone,
    "isActive"
  )
  VALUES (
    'organizer.demo-yard@example.test',
    'demo_yard_organizer',
    '$2b$10$CSriuAqj5lVByMkFlSKFPuJF3A5B6lJszJvmM2QUdHxivTyw.fNs2',
    'Марина',
    'Белова',
    '+7 900 000-10-02',
    true
  )
  RETURNING id INTO organizer_user_id;

  INSERT INTO user_auth_accounts (
    user_id,
    provider,
    login,
    "passwordHash"
  )
  VALUES
    (
      owner_user_id,
      'local',
      'demo_yard_owner',
      '$2b$10$CSriuAqj5lVByMkFlSKFPuJF3A5B6lJszJvmM2QUdHxivTyw.fNs2'
    ),
    (
      organizer_user_id,
      'local',
      'demo_yard_organizer',
      '$2b$10$CSriuAqj5lVByMkFlSKFPuJF3A5B6lJszJvmM2QUdHxivTyw.fNs2'
    );

  INSERT INTO user_roles ("usersId", "rolesId")
  SELECT demo_user.id, role.id
  FROM users demo_user
  CROSS JOIN roles role
  WHERE demo_user.id IN (owner_user_id, organizer_user_id)
    AND role.code = 'user';

  INSERT INTO competitions (
    name,
    slug,
    description,
    "colorPrimary",
    "colorSecondary",
    "isActive",
    type,
    region
  )
  VALUES (
    'Фестиваль дворового футбола',
    'demo-yard-competition',
    'Демонстрационное соревнование с реалистичными командами, игроками, календарём и статистикой.',
    '#174EA6',
    '#F9AB00',
    true,
    'municipal',
    'Московская область'
  )
  RETURNING id INTO competition_id;

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
    competition_id,
    'Летний сезон 2026',
    'demo-yard-season-2026',
    2026,
    DATE '2026-07-01',
    DATE '2026-08-16',
    'active',
    true
  )
  RETURNING id INTO season_id;

  INSERT INTO venues (
    name, slug, description, address, city, latitude, longitude, "isActive"
  )
  VALUES (
    'Стадион «Юность»',
    'demo-yard-venue-yunost',
    'Основная площадка фестиваля, искусственное покрытие и трибуна на 300 зрителей.',
    'ул. Спортивная, 12',
    'Подольск',
    55.4312450,
    37.5443210,
    true
  )
  RETURNING id INTO venue_id;
  venue_ids := array_append(venue_ids, venue_id);

  INSERT INTO venues (
    name, slug, description, address, city, latitude, longitude, "isActive"
  )
  VALUES (
    'Площадка «Метеор»',
    'demo-yard-venue-meteor',
    'Открытая районная площадка с вечерним освещением.',
    'пр-т Победы, 7',
    'Подольск',
    55.4388120,
    37.5571040,
    true
  )
  RETURNING id INTO venue_id;
  venue_ids := array_append(venue_ids, venue_id);

  INSERT INTO venues (
    name, slug, description, address, city, latitude, longitude, "isActive"
  )
  VALUES (
    'Спорткомплекс «Рекорд»',
    'demo-yard-venue-record',
    'Резервная площадка фестиваля с раздевалками и медицинским пунктом.',
    'ул. Парковая, 4',
    'Подольск',
    55.4256130,
    37.5667800,
    true
  )
  RETURNING id INTO venue_id;
  venue_ids := array_append(venue_ids, venue_id);

  FOR team_index IN 1..16 LOOP
    group_index := CASE
      WHEN team_index <= 6 THEN 1
      WHEN team_index <= 11 THEN 2
      ELSE 3
    END;
    group_slot := CASE
      WHEN team_index <= 6 THEN team_index
      WHEN team_index <= 11 THEN team_index - 6
      ELSE team_index - 11
    END;

    INSERT INTO teams (
      name,
      "shortName",
      slug,
      description,
      "primaryColor",
      "secondaryColor",
      city,
      village,
      "foundedYear",
      "isActive"
    )
    VALUES (
      team_names[team_index],
      team_short_names[team_index],
      team_slugs[team_index],
      format(
        'Участник группы %s. Команда создана для реалистичного демонстрационного сезона.',
        group_keys[group_index]
      ),
      primary_colors[team_index],
      secondary_colors[team_index],
      'Подольск',
      CASE WHEN team_index % 4 = 0 THEN 'Дубровицы' ELSE NULL END,
      2004 + (team_index % 18),
      true
    )
    RETURNING id INTO team_id;

    team_ids := array_append(team_ids, team_id);

    FOR player_index IN 1..12 LOOP
      INSERT INTO players (
        "firstName",
        "lastName",
        "middleName",
        slug,
        "birthDate",
        "preferredFoot",
        position,
        "isActive"
      )
      VALUES (
        first_names[((team_index + player_index - 2) % array_length(first_names, 1)) + 1],
        last_names[((team_index * 3 + player_index - 2) % array_length(last_names, 1)) + 1],
        CASE
          WHEN player_index % 3 = 0 THEN 'Александрович'
          WHEN player_index % 3 = 1 THEN 'Сергеевич'
          ELSE 'Дмитриевич'
        END,
        format('demo-yard-player-%s-%s', lpad(team_index::text, 2, '0'), lpad(player_index::text, 2, '0')),
        DATE '1989-01-01' + ((team_index * 211 + player_index * 97) % 5600),
        CASE
          WHEN player_index % 7 = 0 THEN 'both'::players_preferredfoot_enum
          WHEN player_index % 4 = 0 THEN 'left'::players_preferredfoot_enum
          ELSE 'right'::players_preferredfoot_enum
        END,
        CASE
          WHEN player_index = 1 THEN 'goalkeeper'::players_position_enum
          WHEN player_index BETWEEN 2 AND 5 THEN 'defender'::players_position_enum
          WHEN player_index BETWEEN 6 AND 9 THEN 'midfielder'::players_position_enum
          ELSE 'forward'::players_position_enum
        END,
        true
      )
      RETURNING id INTO scorer_id;

      INSERT INTO team_players (
        team_id,
        player_id,
        "shirtNumber",
        position,
        "isCaptain",
        "isActive",
        "joinedAt"
      )
      VALUES (
        team_id,
        scorer_id,
        shirt_numbers[player_index],
        CASE
          WHEN player_index = 1 THEN 'goalkeeper'::team_players_position_enum
          WHEN player_index BETWEEN 2 AND 5 THEN 'defender'::team_players_position_enum
          WHEN player_index BETWEEN 6 AND 9 THEN 'midfielder'::team_players_position_enum
          ELSE 'forward'::team_players_position_enum
        END,
        player_index = 10,
        true,
        DATE '2026-05-15' + (team_index % 10)
      );
    END LOOP;
  END LOOP;

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
    "colorPrimary",
    "colorSecondary",
    "isActive",
    owner_user_id,
    lifecycle_status
  )
  VALUES (
    season_id,
    'Дворовая лига — лето 2026',
    'demo-yard-league-2026',
    'Шестнадцать команд в группах по шесть, пять и пять. Победители групп и лучшая вторая команда выходят в суперфинал.',
    'league',
    'mixed',
    DATE '2026-07-05',
    DATE '2026-08-16',
    'active',
    '#174EA6',
    '#F9AB00',
    true,
    owner_user_id,
    'in_progress'
  )
  RETURNING id INTO tournament_id;

  INSERT INTO tournament_members (tournament_id, user_id, role)
  VALUES (tournament_id, organizer_user_id, 'organizer');

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
    tournament_id,
    'group-stage',
    'Групповой этап',
    'group_stage',
    1,
    'active',
    DATE '2026-07-05',
    DATE '2026-07-23',
    '{
      "groupsCount": 3,
      "groupSizes": [6, 5, 5],
      "schedule": {
        "algorithm": "circle",
        "legs": 1,
        "totalMatches": 35
      }
    }'::jsonb
  )
  RETURNING id INTO group_stage_id;

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
    tournament_id,
    'super-final',
    'Суперфинал',
    'knockout',
    2,
    'pending',
    DATE '2026-08-09',
    DATE '2026-08-16',
    '{
      "bracketSize": 4,
      "matches": ["semi_final", "third_place", "final"],
      "qualificationRequired": true
    }'::jsonb
  )
  RETURNING id INTO playoff_stage_id;

  FOR group_index IN 1..3 LOOP
    INSERT INTO tournament_groups (
      stage_id,
      key,
      name,
      "order",
      capacity,
      status
    )
    VALUES (
      group_stage_id,
      group_keys[group_index],
      format('Группа %s', group_keys[group_index]),
      group_index,
      CASE WHEN group_index = 1 THEN 6 ELSE 5 END,
      'confirmed'
    );
  END LOOP;

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
    tournament_id,
    1,
    1,
    $rules$
    {
      "schemaVersion": 1,
      "stages": [
        {
          "stageKey": "group-stage",
          "type": "group_stage",
          "groups": { "count": 3, "groupSizes": [6, 5, 5] },
          "schedule": {
            "algorithm": "circle",
            "legs": 1,
            "balanceHomeAway": true
          },
          "scoring": { "win": 3, "draw": 1, "loss": 0 },
          "standings": {
            "tieBreakers": [
              {
                "type": "head_to_head",
                "metrics": ["points", "wins", "goal_difference", "goals_for"],
                "reapplyAfterReduction": true
              },
              { "type": "wins", "scope": "all_matches" },
              { "type": "goal_difference", "scope": "all_matches" },
              { "type": "goals_for", "scope": "all_matches" },
              { "type": "draw" }
            ],
            "disciplinaryScore": {
              "yellowCard": 1,
              "secondYellowCard": 3,
              "redCard": 5
            }
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
          "stageKey": "super-final",
          "type": "knockout",
          "bracket": {
            "size": 4,
            "placementMatch": "third_place",
            "seeding": {
              "type": "best_eligible_opponent",
              "protectedQualificationRuleId": "best-runner-up",
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
          "fromStageKey": "group-stage",
          "toStageKey": "super-final",
          "confirmationRequired": true,
          "qualification": [
            { "id": "group-winners", "type": "group_winners" },
            {
              "id": "best-runner-up",
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
    TIMESTAMP '2026-06-25 12:00:00',
    owner_user_id,
    owner_user_id,
    'Начальная опубликованная версия правил Дворовой лиги.'
  )
  RETURNING id INTO rule_version_id;

  UPDATE tournaments
  SET active_rule_version_id = rule_version_id
  WHERE id = tournament_id;

  FOR team_index IN 1..16 LOOP
    group_index := CASE
      WHEN team_index <= 6 THEN 1
      WHEN team_index <= 11 THEN 2
      ELSE 3
    END;
    group_slot := CASE
      WHEN team_index <= 6 THEN team_index
      WHEN team_index <= 11 THEN team_index - 6
      ELSE team_index - 11
    END;

    SELECT id
    INTO group_id
    FROM tournament_groups
    WHERE stage_id = group_stage_id
      AND key = group_keys[group_index];

    INSERT INTO tournament_teams (
      tournament_id,
      team_id,
      "groupName",
      "seedNumber",
      status
    )
    VALUES (
      tournament_id,
      team_ids[team_index],
      group_keys[group_index],
      team_index,
      'active'
    )
    RETURNING id INTO tournament_team_id;

    INSERT INTO tournament_stage_participants (
      stage_id,
      tournament_team_id,
      group_id,
      seed_number,
      qualification_source,
      status
    )
    VALUES (
      group_stage_id,
      tournament_team_id,
      group_id,
      group_slot,
      'initial_registration',
      'active'
    );
  END LOOP;

  FOR group_index IN 1..3 LOOP
    SELECT id
    INTO group_id
    FROM tournament_groups
    WHERE stage_id = group_stage_id
      AND key = group_keys[group_index];

    group_offset := CASE group_index WHEN 1 THEN 0 WHEN 2 THEN 6 ELSE 11 END;
    pairs_in_round := CASE WHEN group_index = 1 THEN 3 ELSE 2 END;

    FOR round_index IN 1..5 LOOP
      FOR pair_index IN 1..pairs_in_round LOOP
        home_slot := CASE
          WHEN group_index = 1 THEN home_slots_six[round_index][pair_index]
          ELSE home_slots[round_index][pair_index]
        END;
        away_slot := CASE
          WHEN group_index = 1 THEN away_slots_six[round_index][pair_index]
          ELSE away_slots[round_index][pair_index]
        END;
        home_team_id := team_ids[group_offset + home_slot];
        away_team_id := team_ids[group_offset + away_slot];
        score_key := group_index * 100 + round_index * 10 + pair_index;

        home_score := CASE score_key
          WHEN 111 THEN 3 WHEN 112 THEN 1
          WHEN 121 THEN 2 WHEN 122 THEN 2
          WHEN 131 THEN 1 WHEN 132 THEN 0
          WHEN 211 THEN 3 WHEN 212 THEN 2
          WHEN 221 THEN 3 WHEN 222 THEN 1
          WHEN 231 THEN 2 WHEN 232 THEN 1
          WHEN 311 THEN 4 WHEN 312 THEN 0
          WHEN 321 THEN 1 WHEN 322 THEN 2
          WHEN 331 THEN 1 WHEN 332 THEN 0
          ELSE 0
        END;

        away_score := CASE score_key
          WHEN 111 THEN 0 WHEN 112 THEN 1
          WHEN 121 THEN 0 WHEN 122 THEN 1
          WHEN 131 THEN 0 WHEN 132 THEN 2
          WHEN 211 THEN 0 WHEN 212 THEN 2
          WHEN 221 THEN 0 WHEN 222 THEN 0
          WHEN 231 THEN 0 WHEN 232 THEN 3
          WHEN 311 THEN 1 WHEN 312 THEN 0
          WHEN 321 THEN 0 WHEN 322 THEN 2
          WHEN 331 THEN 1 WHEN 332 THEN 1
          ELSE 0
        END;

        IF round_index <= 3 AND home_score > away_score THEN
          winner_team_id := home_team_id;
          loser_team_id := away_team_id;
        ELSIF round_index <= 3 AND away_score > home_score THEN
          winner_team_id := away_team_id;
          loser_team_id := home_team_id;
        ELSE
          winner_team_id := NULL;
          loser_team_id := NULL;
        END IF;

        match_at :=
          TIMESTAMP '2026-07-05 10:00:00'
          + ((round_index - 1) * INTERVAL '4 days')
          + ((group_index - 1) * INTERVAL '2 hours')
          + ((pair_index - 1) * INTERVAL '70 minutes');

        INSERT INTO matches (
          tournament_id,
          home_team_id,
          away_team_id,
          venue_id,
          match_datetime,
          round,
          status,
          home_score,
          away_score,
          stage_id,
          group_id,
          round_type,
          round_number,
          winner_team_id,
          loser_team_id,
          regular_time_home_score,
          regular_time_away_score,
          resolution_type,
          result_official_at,
          effective_rule_version_id
        )
        VALUES (
          tournament_id,
          home_team_id,
          away_team_id,
          venue_ids[((group_index + pair_index - 2) % 3) + 1],
          match_at,
          format('Группа %s, тур %s', group_keys[group_index], round_index),
          CASE
            WHEN round_index <= 3 THEN 'finished'::matches_status_enum
            ELSE 'scheduled'::matches_status_enum
          END,
          CASE WHEN round_index <= 3 THEN home_score ELSE 0 END,
          CASE WHEN round_index <= 3 THEN away_score ELSE 0 END,
          group_stage_id,
          group_id,
          'group_round',
          round_index,
          winner_team_id,
          loser_team_id,
          CASE WHEN round_index <= 3 THEN home_score ELSE NULL END,
          CASE WHEN round_index <= 3 THEN away_score ELSE NULL END,
          CASE
            WHEN round_index <= 3 THEN 'regular_time'::match_resolution_type_enum
            ELSE NULL
          END,
          CASE
            WHEN round_index <= 3 THEN match_at + INTERVAL '55 minutes'
            ELSE NULL
          END,
          rule_version_id
        )
        RETURNING id INTO match_id;

        IF score_key = 112 THEN
          red_source_match_id := match_id;
        END IF;

        IF score_key = 232 THEN
          suspension_source_match_id := match_id;
        END IF;

        IF round_index <= 3 THEN
          INSERT INTO match_officials (match_id, "fullName", role)
          VALUES
            (
              match_id,
              CASE (match_id % 3)
                WHEN 0 THEN 'Сергей Крылов'
                WHEN 1 THEN 'Андрей Захаров'
                ELSE 'Михаил Комаров'
              END,
              'main_referee'
            ),
            (
              match_id,
              CASE (match_id % 3)
                WHEN 0 THEN 'Павел Ефимов'
                WHEN 1 THEN 'Олег Воронов'
                ELSE 'Илья Фролов'
              END,
              'timekeeper'
            );

          INSERT INTO match_rosters (
            match_id,
            team_id,
            is_approved,
            is_submitted,
            submitted_at,
            submitted_by_user_id,
            approved_at,
            approved_by_user_id
          )
          VALUES (
            match_id,
            home_team_id,
            true,
            true,
            match_at - INTERVAL '35 minutes',
            organizer_user_id,
            match_at - INTERVAL '20 minutes',
            owner_user_id
          )
          RETURNING id INTO roster_id;

          INSERT INTO match_roster_players (
            match_roster_id,
            player_id,
            team_player_id,
            shirt_number,
            position,
            is_captain,
            was_allowed
          )
          SELECT
            roster_id,
            tp.player_id,
            tp.id,
            tp."shirtNumber",
            tp.position::text::match_roster_players_position_enum,
            tp."isCaptain",
            true
          FROM team_players tp
          WHERE tp.team_id = home_team_id
            AND tp."isActive" = true
          ORDER BY tp."shirtNumber"
          LIMIT 10;

          INSERT INTO match_rosters (
            match_id,
            team_id,
            is_approved,
            is_submitted,
            submitted_at,
            submitted_by_user_id,
            approved_at,
            approved_by_user_id
          )
          VALUES (
            match_id,
            away_team_id,
            true,
            true,
            match_at - INTERVAL '32 minutes',
            organizer_user_id,
            match_at - INTERVAL '18 minutes',
            owner_user_id
          )
          RETURNING id INTO roster_id;

          INSERT INTO match_roster_players (
            match_roster_id,
            player_id,
            team_player_id,
            shirt_number,
            position,
            is_captain,
            was_allowed
          )
          SELECT
            roster_id,
            tp.player_id,
            tp.id,
            tp."shirtNumber",
            tp.position::text::match_roster_players_position_enum,
            tp."isCaptain",
            true
          FROM team_players tp
          WHERE tp.team_id = away_team_id
            AND tp."isActive" = true
          ORDER BY tp."shirtNumber"
          LIMIT 10;

          INSERT INTO match_events (
            match_id,
            team_id,
            "eventType",
            minute,
            half,
            second,
            description,
            client_event_id
          )
          VALUES (
            match_id,
            home_team_id,
            'match_started',
            0,
            1,
            0,
            'Матч начат',
            format('demo-yard-match-%s-start', match_id)
          );

          IF home_score > 0 THEN
            FOR event_index IN 1..home_score LOOP
              SELECT tp.player_id
              INTO scorer_id
              FROM team_players tp
              WHERE tp.team_id = home_team_id
              ORDER BY tp."shirtNumber"
              OFFSET (6 + ((event_index - 1) % 4))
              LIMIT 1;

              SELECT tp.player_id
              INTO assist_id
              FROM team_players tp
              WHERE tp.team_id = home_team_id
              ORDER BY tp."shirtNumber"
              OFFSET (4 + ((event_index - 1) % 2))
              LIMIT 1;

              INSERT INTO match_events (
                match_id,
                team_id,
                player_id,
                "eventType",
                minute,
                half,
                second,
                description,
                assist_player_id,
                client_event_id,
                goal_value
              )
              VALUES (
                match_id,
                home_team_id,
                scorer_id,
                'goal',
                5 + event_index * 7,
                CASE WHEN 5 + event_index * 7 <= 20 THEN 1 ELSE 2 END,
                20 + event_index * 3,
                'Гол с игры',
                CASE WHEN assist_id = scorer_id THEN NULL ELSE assist_id END,
                format('demo-yard-match-%s-home-goal-%s', match_id, event_index),
                1
              );
            END LOOP;
          END IF;

          IF away_score > 0 THEN
            FOR event_index IN 1..away_score LOOP
              SELECT tp.player_id
              INTO scorer_id
              FROM team_players tp
              WHERE tp.team_id = away_team_id
              ORDER BY tp."shirtNumber"
              OFFSET (7 + ((event_index - 1) % 3))
              LIMIT 1;

              SELECT tp.player_id
              INTO assist_id
              FROM team_players tp
              WHERE tp.team_id = away_team_id
              ORDER BY tp."shirtNumber"
              OFFSET (5 + ((event_index - 1) % 2))
              LIMIT 1;

              INSERT INTO match_events (
                match_id,
                team_id,
                player_id,
                "eventType",
                minute,
                half,
                second,
                description,
                assist_player_id,
                client_event_id,
                goal_value
              )
              VALUES (
                match_id,
                away_team_id,
                scorer_id,
                'goal',
                8 + event_index * 8,
                CASE WHEN 8 + event_index * 8 <= 20 THEN 1 ELSE 2 END,
                35 + event_index * 4,
                'Гол с игры',
                CASE WHEN assist_id = scorer_id THEN NULL ELSE assist_id END,
                format('demo-yard-match-%s-away-goal-%s', match_id, event_index),
                1
              );
            END LOOP;
          END IF;

          IF pair_index = 1 THEN
            SELECT tp.player_id
            INTO card_player_id
            FROM team_players tp
            WHERE tp.team_id = home_team_id
              AND tp."shirtNumber" = 4;

            INSERT INTO match_events (
              match_id,
              team_id,
              player_id,
              "eventType",
              minute,
              half,
              second,
              description,
              client_event_id
            )
            VALUES (
              match_id,
              home_team_id,
              card_player_id,
              'yellow_card',
              28,
              2,
              10,
              'Предупреждение за срыв атаки',
              format('demo-yard-match-%s-yellow-home', match_id)
            );
          END IF;

          IF group_index = 2 AND (home_slot = 3 OR away_slot = 3) THEN
            suspension_team_id := team_ids[8];

            SELECT tp.player_id
            INTO suspension_player_id
            FROM team_players tp
            WHERE tp.team_id = suspension_team_id
              AND tp."shirtNumber" = 6;

            INSERT INTO match_events (
              match_id,
              team_id,
              player_id,
              "eventType",
              minute,
              half,
              second,
              description,
              client_event_id
            )
            VALUES (
              match_id,
              suspension_team_id,
              suspension_player_id,
              'yellow_card',
              16 + round_index * 5,
              CASE WHEN 16 + round_index * 5 <= 20 THEN 1 ELSE 2 END,
              42,
              'Накопленное предупреждение',
              format('demo-yard-match-%s-yellow-accumulated', match_id)
            );
          END IF;

          IF score_key = 112 THEN
            red_team_id := team_ids[4];

            SELECT tp.player_id
            INTO red_player_id
            FROM team_players tp
            WHERE tp.team_id = red_team_id
              AND tp."shirtNumber" = 5;

            INSERT INTO match_events (
              match_id,
              team_id,
              player_id,
              "eventType",
              minute,
              half,
              second,
              description,
              client_event_id
            )
            VALUES (
              match_id,
              red_team_id,
              red_player_id,
              'red_card',
              37,
              2,
              18,
              'Прямая красная карточка за грубую игру',
              format('demo-yard-match-%s-red', match_id)
            );
          END IF;

          INSERT INTO match_events (
            match_id,
            team_id,
            "eventType",
            minute,
            half,
            second,
            description,
            client_event_id
          )
          VALUES (
            match_id,
            home_team_id,
            'match_finished',
            40,
            2,
            0,
            'Матч завершён, результат подтверждён',
            format('demo-yard-match-%s-finish', match_id)
          );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  WITH participant_teams AS (
    SELECT
      tt.team_id,
      participant.group_id
    FROM tournament_stage_participants participant
    JOIN tournament_teams tt ON tt.id = participant.tournament_team_id
    WHERE participant.stage_id = group_stage_id
  ),
  results AS (
    SELECT
      match.home_team_id AS team_id,
      match.group_id,
      1 AS played,
      CASE WHEN match.home_score > match.away_score THEN 1 ELSE 0 END AS wins,
      CASE WHEN match.home_score = match.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN match.home_score < match.away_score THEN 1 ELSE 0 END AS losses,
      match.home_score AS goals_for,
      match.away_score AS goals_against,
      CASE
        WHEN match.home_score > match.away_score THEN 3
        WHEN match.home_score = match.away_score THEN 1
        ELSE 0
      END AS points
    FROM matches match
    WHERE match.tournament_id = tournament_id
      AND match.stage_id = group_stage_id
      AND match.status = 'finished'

    UNION ALL

    SELECT
      match.away_team_id AS team_id,
      match.group_id,
      1 AS played,
      CASE WHEN match.away_score > match.home_score THEN 1 ELSE 0 END AS wins,
      CASE WHEN match.away_score = match.home_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN match.away_score < match.home_score THEN 1 ELSE 0 END AS losses,
      match.away_score AS goals_for,
      match.home_score AS goals_against,
      CASE
        WHEN match.away_score > match.home_score THEN 3
        WHEN match.away_score = match.home_score THEN 1
        ELSE 0
      END AS points
    FROM matches match
    WHERE match.tournament_id = tournament_id
      AND match.stage_id = group_stage_id
      AND match.status = 'finished'
  ),
  aggregates AS (
    SELECT
      participant.team_id,
      participant.group_id,
      COALESCE(sum(result.played), 0)::integer AS played,
      COALESCE(sum(result.wins), 0)::integer AS wins,
      COALESCE(sum(result.draws), 0)::integer AS draws,
      COALESCE(sum(result.losses), 0)::integer AS losses,
      COALESCE(sum(result.goals_for), 0)::integer AS goals_for,
      COALESCE(sum(result.goals_against), 0)::integer AS goals_against,
      COALESCE(sum(result.points), 0)::integer AS points
    FROM participant_teams participant
    LEFT JOIN results result
      ON result.team_id = participant.team_id
      AND result.group_id = participant.group_id
    GROUP BY participant.team_id, participant.group_id
  ),
  cards AS (
    SELECT
      event.team_id,
      sum(
        CASE event."eventType"
          WHEN 'yellow_card' THEN 1
          WHEN 'second_yellow_card' THEN 3
          WHEN 'red_card' THEN 5
          ELSE 0
        END
      )::integer AS disciplinary_score
    FROM match_events event
    JOIN matches match ON match.id = event.match_id
    WHERE match.tournament_id = tournament_id
      AND event.is_cancelled = false
    GROUP BY event.team_id
  ),
  ranked AS (
    SELECT
      aggregate.*,
      (aggregate.goals_for - aggregate.goals_against) AS goal_difference,
      COALESCE(cards.disciplinary_score, 0) AS disciplinary_score,
      row_number() OVER (
        PARTITION BY aggregate.group_id
        ORDER BY
          aggregate.points DESC,
          aggregate.wins DESC,
          (aggregate.goals_for - aggregate.goals_against) DESC,
          aggregate.goals_for DESC,
          aggregate.team_id
      )::integer AS position
    FROM aggregates aggregate
    LEFT JOIN cards ON cards.team_id = aggregate.team_id
  )
  INSERT INTO standings (
    tournament_id,
    team_id,
    position,
    played,
    wins,
    draws,
    losses,
    "goalsFor",
    "goalsAgainst",
    "goalDifference",
    points,
    stage_id,
    group_id,
    rule_version_id,
    disciplinary_score
  )
  SELECT
    tournament_id,
    ranked.team_id,
    ranked.position,
    ranked.played,
    ranked.wins,
    ranked.draws,
    ranked.losses,
    ranked.goals_for,
    ranked.goals_against,
    ranked.goal_difference,
    ranked.points,
    group_stage_id,
    ranked.group_id,
    rule_version_id,
    ranked.disciplinary_score
  FROM ranked;

  WITH card_counts AS (
    SELECT
      event.team_id,
      event.player_id,
      count(*) FILTER (WHERE event."eventType" = 'yellow_card')::integer AS yellow_cards,
      count(*) FILTER (WHERE event."eventType" = 'red_card')::integer AS red_cards,
      count(*) FILTER (WHERE event."eventType" = 'second_yellow_card')::integer AS second_yellow_cards
    FROM match_events event
    JOIN matches match ON match.id = event.match_id
    WHERE match.tournament_id = tournament_id
      AND event.player_id IS NOT NULL
      AND event.is_cancelled = false
    GROUP BY event.team_id, event.player_id
  )
  INSERT INTO player_tournament_stats (
    tournament_id,
    team_id,
    player_id,
    yellow_cards,
    red_cards,
    second_yellow_cards,
    suspensions_served,
    is_suspended,
    suspension_reason
  )
  SELECT
    tournament_id,
    tp.team_id,
    tp.player_id,
    COALESCE(cards.yellow_cards, 0),
    COALESCE(cards.red_cards, 0),
    COALESCE(cards.second_yellow_cards, 0),
    CASE WHEN player.slug = 'demo-yard-player-04-05' THEN 1 ELSE 0 END,
    player.slug = 'demo-yard-player-08-06',
    NULL
  FROM team_players tp
  JOIN players player ON player.id = tp.player_id
  LEFT JOIN card_counts cards
    ON cards.team_id = tp.team_id
    AND cards.player_id = tp.player_id
  WHERE player.slug LIKE 'demo-yard-player-%';

  SELECT player.id, tp.team_id
  INTO suspension_player_id, suspension_team_id
  FROM players player
  JOIN team_players tp ON tp.player_id = player.id
  WHERE player.slug = 'demo-yard-player-08-06';

  INSERT INTO player_suspensions (
    tournament_id,
    stage_id,
    player_id,
    team_id,
    reason,
    matches_required,
    matches_served,
    status,
    source_match_id
  )
  VALUES (
    tournament_id,
    group_stage_id,
    suspension_player_id,
    suspension_team_id,
    'accumulated_yellows',
    1,
    0,
    'active',
    suspension_source_match_id
  );

  SELECT player.id, tp.team_id
  INTO red_player_id, red_team_id
  FROM players player
  JOIN team_players tp ON tp.player_id = player.id
  WHERE player.slug = 'demo-yard-player-04-05';

  INSERT INTO player_suspensions (
    tournament_id,
    stage_id,
    player_id,
    team_id,
    reason,
    matches_required,
    matches_served,
    status,
    source_match_id,
    served_at
  )
  VALUES (
    tournament_id,
    group_stage_id,
    red_player_id,
    red_team_id,
    'direct_red',
    1,
    1,
    'served',
    red_source_match_id,
    TIMESTAMP '2026-07-09 09:00:00'
  );

  INSERT INTO news (
    title,
    slug,
    excerpt,
    content,
    "coverUrl",
    status,
    "publishedAt"
  )
  VALUES
    (
      'Дворовая лига стартовала',
      'demo-yard-news-season-start',
      'Шестнадцать команд начали борьбу за четыре места в суперфинале.',
      'В турнире участвуют шестнадцать команд, распределённых по трём группам: шесть, пять и пять. При сравнении одинаковых мест результат против последней команды большей группы не учитывается. В суперфинал выйдут победители групп и лучшая команда среди вторых мест.',
      NULL,
      'published',
      TIMESTAMP '2026-07-05 09:00:00'
    ),
    (
      'Завершены первые три тура',
      'demo-yard-news-round-three',
      'В группах появились лидеры, но борьба за выход в суперфинал продолжается.',
      'После трёх туров ни одна команда ещё не гарантировала себе выход в плей-офф. В календаре остаются два тура в каждой группе.',
      NULL,
      'published',
      TIMESTAMP '2026-07-14 18:30:00'
    );

  RAISE NOTICE
    'Created realistic Yard League demo: tournament %, 16 teams, 192 players, 35 matches',
    tournament_id;
END
$seed$;

COMMIT;

SELECT
  tournament.id AS tournament_id,
  tournament.name AS tournament,
  count(DISTINCT tournament_team.team_id) AS teams,
  count(DISTINCT team_player.player_id) AS players,
  count(DISTINCT match.id) AS matches,
  count(DISTINCT match.id) FILTER (WHERE match.status = 'finished') AS finished_matches,
  count(DISTINCT match.id) FILTER (WHERE match.status = 'scheduled') AS scheduled_matches,
  count(DISTINCT standing.id) AS standing_rows,
  count(DISTINCT suspension.id) FILTER (WHERE suspension.status = 'active') AS active_suspensions
FROM tournaments tournament
JOIN tournament_teams tournament_team
  ON tournament_team.tournament_id = tournament.id
JOIN team_players team_player
  ON team_player.team_id = tournament_team.team_id
LEFT JOIN matches match
  ON match.tournament_id = tournament.id
LEFT JOIN standings standing
  ON standing.tournament_id = tournament.id
LEFT JOIN player_suspensions suspension
  ON suspension.tournament_id = tournament.id
WHERE tournament.slug = 'demo-yard-league-2026'
GROUP BY tournament.id, tournament.name;
