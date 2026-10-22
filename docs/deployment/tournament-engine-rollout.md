# Развёртывание многоэтапной модели турниров

## Область изменений

Миграция `1784164450000-migrate-legacy-tournaments.ts` переводит только турниры, у которых ещё нет этапов. Новые и уже настроенные многоэтапные турниры не изменяются.

Для legacy-турнира миграция:

1. сохраняет контрольный снимок таблицы и статистики;
2. создаёт этап `legacy-main`;
3. при наличии `tournament_teams.groupName` создаёт групповой этап и группы;
4. для `format=knockout` создаёт этап плей-офф;
5. в остальных случаях создаёт круговой этап;
6. создаёт опубликованную начальную версию правил;
7. назначает `tournament_teams` участниками этапа;
8. привязывает матчи, таблицу и активные дисквалификации к этапу;
9. сохраняет снимок после миграции и признак `data_equivalent`.

Поля `matches.round`, `matches.home_score`, `matches.away_score`,
`tournament_teams.groupName`, legacy-статусы и `player_tournament_stats`
не удаляются.

## Feature flags

По умолчанию обе возможности выключены:

```dotenv
TOURNAMENT_BUILDER_ENABLED=false
MULTI_STAGE_PUBLIC_VIEW_ENABLED=false
```

- `TOURNAMENT_BUILDER_ENABLED` открывает Angular-мастер и новые структурные API.
- `MULTI_STAGE_PUBLIC_VIEW_ENABLED` открывает новый публичный read-model.

Backend возвращает текущее состояние через `GET /feature-flags`. Angular при
выключенном публичном read-model использует старый `/standings/:tournamentId`.

Изменение переменных требует перезапуска backend-контейнера. Пересборка
frontend не требуется.

## Рекомендуемый порядок production-развёртывания

### 1. До миграции

1. Отключить оба feature flag.
2. Остановить административные операции изменения результатов.
3. Создать полный backup PostgreSQL:

```bash
pg_dump --format=custom --file=league_os_before_tournament_engine.dump league_os
```

4. Зафиксировать количество турниров, матчей, таблиц и активных наказаний.
5. Проверить, что предыдущие schema migrations применены:

```bash
npm run migration:show
```

### 2. Миграция

```bash
npm run migration:run
npm run migration:verify-legacy
```

Команда проверки завершается с кодом `1`, если:

- таблица или агрегированная статистика отличаются;
- число матчей/участников не совпало;
- остались матчи, standings или активные дисквалификации без этапа;
- не созданы stage/rule version.

Для ручного просмотра:

```sql
SELECT
  tournament_id,
  stage_id,
  rule_version_id,
  data_equivalent,
  standings_before,
  standings_after,
  stats_before,
  stats_after
FROM legacy_tournament_migration_audit
ORDER BY tournament_id;
```

Переключение feature flags запрещено, пока существует запись:

```sql
SELECT *
FROM legacy_tournament_migration_audit
WHERE data_equivalent IS DISTINCT FROM true;
```

### 3. Shadow-проверка

Сначала оставить оба flag выключенными и проверить:

- старый `/standings/:id`;
- `/tournaments/:id/stats-summary`;
- календарь и протокол текущих матчей;
- допуск дисквалифицированных игроков;
- повторный ручной пересчёт таблицы тестового турнира.

Legacy standings endpoint после миграции работает как адаптер: если строк без
`stage_id` уже нет, он читает этап `legacy-main` и возвращает прежний плоский
формат.

### 4. Поэтапное включение

1. Включить `MULTI_STAGE_PUBLIC_VIEW_ENABLED=true` на тестовом окружении.
2. Проверить существующую лигу на desktop и mobile.
3. Проверить Дворовую лигу: три группы, рейтинг вторых мест, полуфиналы,
   матч за третье место и финал.
4. Включить публичный flag в production.
5. После периода наблюдения включить `TOURNAMENT_BUILDER_ENABLED=true`.

## Мониторинг

После включения контролировать:

- частоту `404/500` для `/standings/tournaments/*/public-view`;
- расхождения `legacy_tournament_migration_audit.data_equivalent`;
- матчи без `stage_id`;
- матчи без `effective_rule_version_id`;
- активные дисквалификации без `stage_id`;
- время ответа публичного read-model;
- ошибки подтверждения qualification/bracket snapshot.

Контрольный запрос:

```sql
SELECT
  (SELECT COUNT(*) FROM matches WHERE stage_id IS NULL) AS matches_without_stage,
  (SELECT COUNT(*) FROM standings WHERE stage_id IS NULL) AS standings_without_stage,
  (
    SELECT COUNT(*)
    FROM player_suspensions
    WHERE status = 'active' AND stage_id IS NULL
  ) AS active_suspensions_without_stage;
```

## Отключение без rollback

Предпочтительный аварийный сценарий:

1. установить оба flag в `false`;
2. перезапустить backend;
3. проверить старые endpoints;
4. оставить новые данные в базе до анализа.

Это безопаснее отката миграции: старый API продолжает читать migrated stage
через адаптер.

## Откат миграции

Rollback допустим только до создания новых матчей или изменений состава в
созданных миграцией этапах:

```bash
npm run migration:revert
```

Миграция блокирует откат, если в `legacy-main` найдены матчи с ID выше
максимального legacy ID, сохранённого до перехода.

При откате:

- исходные матчи, standings и дисквалификации снова получают `stage_id=NULL`;
- `round` и старые результаты остаются неизменными;
- удаляются только stage participants с `qualification_source=legacy_migration`;
- удаляются только rule versions и stages с маркером данной миграции.

Если после миграции уже появились новые данные, нужен restore из backup или
отдельный согласованный rollback-скрипт.

## Выявленные риски и возможные расхождения

### Требуют ручного подтверждения

1. Продолжительность матчей старой лиги отсутствует в legacy-модели. В v1
   сохраняется `periodDurationMinutes=null`.
2. Для legacy knockout невозможно достоверно восстановить все раунды только по
   строковому `round`. Не распознанные записи получают `round_of_16`.
3. Размер legacy knockout округляется вверх до `2/4/8/16/32`. Турниры более
   чем с 32 участниками требуют ручной настройки.
4. Для `mixed` без заполненного `groupName` создаётся один круговой этап.
   Реальную историческую структуру необходимо проверить вручную.
5. Порядок legacy-групп формируется лексикографически по `groupName`.
6. В legacy standings использовались критерии
   `очки → разница → забитые → детерминированный жребий`. Именно они записаны
   в bootstrap rule version.
7. Активные дисквалификации привязываются к единственному созданному этапу.
   Исторические уже отбытые наказания остаются в legacy-статистике.
8. Владельцы старых турниров автоматически не назначаются: источник истины
   для ownership отсутствует. До открытия конструктора необходимо назначить
   владельцев вручную.

### Обязательные ручные действия перед production

- назначить `owner_user_id` для турниров, которые будут редактироваться;
- проверить `groupName` на опечатки и разные варианты одного названия;
- проверить строковые значения `matches.round` у кубковых турниров;
- подтвердить длительность матча и дисциплинарные параметры текущей лиги;
- решить судьбу отменённых турниров, отображаемых как `completed`;
- проверить все строки audit с `data_equivalent=false`;
- выполнить полное DB e2e на копии production-базы;
- проверить доступность Chrome/браузерного runner в CI для Angular tests.

## Критерии завершения перехода

Legacy-поля нельзя удалять до выполнения всех условий:

- все активные турниры имеют этапы и активную rule version;
- минимум один полный сезон завершён на новом engine;
- shadow-сравнение не фиксирует расхождений;
- старые клиенты и endpoints больше не используются;
- подготовлена отдельная contract migration с собственным backup/rollback.
