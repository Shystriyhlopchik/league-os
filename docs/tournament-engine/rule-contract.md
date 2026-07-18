# Типизированный контракт правил

## Общая модель

Ниже приведён нормативный TypeScript-контракт. На первом этапе он существует как спецификация; при реализации должен быть перенесён в единый пакет контрактов или стать источником JSON Schema/OpenAPI.

```ts
type StageType = 'round_robin' | 'group_stage' | 'knockout';

interface TournamentRulesConfigV1 {
  schemaVersion: 1;
  stages: StageRulesV1[];
  transitions: StageTransitionRuleV1[];
}

type StageRulesV1 =
  | RoundRobinStageRulesV1
  | GroupStageRulesV1
  | KnockoutStageRulesV1;

interface StageRulesBaseV1 {
  stageKey: string;
  match: MatchRulesV1;
  discipline: DisciplineRulesV1;
}

interface RoundRobinStageRulesV1 extends StageRulesBaseV1 {
  type: 'round_robin';
  schedule: RoundRobinScheduleRuleV1;
  scoring: ScoringRuleV1;
  standings: StandingsRuleV1;
}

interface GroupStageRulesV1 extends StageRulesBaseV1 {
  type: 'group_stage';
  groups: { count: number } & (
    | { teamsPerGroup: number }
    | { groupSizes: number[] }
  );
  schedule: RoundRobinScheduleRuleV1;
  scoring: ScoringRuleV1;
  standings: StandingsRuleV1;
}

interface KnockoutStageRulesV1 extends StageRulesBaseV1 {
  type: 'knockout';
  bracket: BracketRuleV1;
}
```

## Начисление очков

```ts
interface ScoringRuleV1 {
  win: number;
  draw: number;
  loss: number;
  technicalWin?: number;
  technicalLoss?: number;
}
```

Ограничения:

- значения — целые числа в разрешённом диапазоне;
- для этапа без ничьих поле `draw` сохраняется, но не должно использоваться завершённым матчем;
- штраф очков оформляется `TournamentDecision`, а не отрицательным исходом матча.

## Календарь

```ts
interface RoundRobinScheduleRuleV1 {
  algorithm: 'circle';
  legs: 1 | 2 | 3 | 4;
  balanceHomeAway: boolean;
}
```

Генератор создаёт только состав пар и номера туров. Даты, время, площадки и судьи являются операционными данными.

## Турнирная таблица и тай-брейки

```ts
interface StandingsRuleV1 {
  tieBreakers: TieBreakerRuleV1[];
  disciplinaryScore?: {
    yellowCard: number;
    secondYellowCard: number;
    redCard: number;
  };
}

type TieBreakerRuleV1 =
  | { type: 'points'; scope: 'all_matches' }
  | { type: 'head_to_head'; metrics: HeadToHeadMetricV1[]; reapplyAfterReduction: boolean }
  | { type: 'wins'; scope: 'all_matches' }
  | { type: 'goal_difference'; scope: 'all_matches' }
  | { type: 'goals_for'; scope: 'all_matches' }
  | { type: 'goals_against'; scope: 'all_matches'; order: 'asc' }
  | { type: 'disciplinary_score'; order: 'asc' }
  | { type: 'technical_loss'; order: 'asc' }
  | { type: 'manual_decision' }
  | { type: 'draw' }
  | { type: 'draw_lots' };

type HeadToHeadMetricV1 =
  | 'points'
  | 'wins'
  | 'goal_difference'
  | 'goals_for';
```

Правила применяются строго в порядке массива. `head_to_head` строит мини-таблицу только из матчей равных команд. `draw_lots` и `manual_decision` не генерируют случайное число при каждом чтении — они требуют сохранённый `TournamentDecision`.

## Квалификация

```ts
interface StageTransitionRuleV1 {
  fromStageKey: string;
  toStageKey: string;
  qualification: QualificationRuleV1[];
  crossGroupComparison?: {
    unequalGroups: {
      type: 'exclude_matches_against_last_placed';
    };
  };
  confirmationRequired: true;
}

type QualificationRuleV1 =
  | {
      id: string;
      type: 'top_n_per_group';
      positions: number[];
    }
  | {
      id: string;
      type: 'group_winners';
    }
  | {
      id: string;
      type: 'best_placed_teams_between_groups';
      sourcePosition: number;
      count: number;
      ranking: CrossGroupRankingRuleV1;
    }
  | {
      id: string;
      type: 'overall_ranking';
      count: number;
      ranking: CrossGroupRankingRuleV1;
    }
  | {
      id: string;
      type: 'manual_selection';
      count: number;
    };

interface CrossGroupRankingRuleV1 {
  criteria: CrossGroupCriterionV1[];
}

type CrossGroupCriterionV1 =
  | 'points'
  | 'wins'
  | 'goal_difference'
  | 'goals_for'
  | 'goals_against_asc'
  | 'disciplinary_score_asc'
  | 'draw_lots';
```

Если группы имеют разный размер, `exclude_matches_against_last_placed` приводит сравнение к размеру наименьшей группы: у кандидатов из большей группы исключаются матчи против команд на последних лишних местах. Внутригрупповая таблица при этом не изменяется. Нормализованные показатели и список исключённых матчей сохраняются в qualification snapshot.

## Посев и сетка

```ts
interface BracketRuleV1 {
  size: 2 | 4 | 8 | 16 | 32;
  placementMatch?: 'third_place';
  seeding: SeedingRuleV1;
}

type SeedingRuleV1 =
  | { type: 'standard'; ranking: CrossGroupRankingRuleV1 }
  | { type: 'random_draw' }
  | { type: 'manual' }
  | {
      type: 'best_eligible_opponent';
      protectedQualificationRuleId: string;
      candidateQualificationRuleId: string;
      candidateRanking: CrossGroupRankingRuleV1;
      constraints: PairingConstraintV1[];
      remaining: 'pair_in_ranking_order';
    };

type PairingConstraintV1 =
  | { type: 'avoid_same_source_group'; mode: 'required' | 'best_effort' };
```

Случайная жеребьёвка сохраняется как решение с seed/result и не повторяется при каждом запросе. Невыполнимое обязательное ограничение блокирует подтверждение сетки.

## Определение победителя матча

```ts
interface MatchRulesV1 {
  periods: number;
  periodDurationMinutes: number | null;
  allowDraw: boolean;
  extraTime: ExtraTimeRuleV1;
  penalties: PenaltyShootoutRuleV1;
}

type ExtraTimeRuleV1 =
  | { enabled: false }
  | { enabled: true; periods: number; periodDurationMinutes: number };

type PenaltyShootoutRuleV1 =
  | { enabled: false }
  | { enabled: true; initialKicksPerTeam: number; suddenDeath: true };
```

Инварианты:

- завершённый knockout-матч имеет `winnerTeamId`;
- если `allowDraw=false`, должен быть разрешён хотя бы один способ определить победителя;
- удары серии не входят в обычный счёт и статистику голов;
- technical result является административным решением, а не специальным значением счёта.

## Дисциплина

```ts
interface DisciplineRulesV1 {
  accumulatedYellows: AccumulatedYellowRuleV1 | { enabled: false };
  secondYellowInMatch: SuspensionRuleV1 | { enabled: false };
  directRed: SuspensionRuleV1 | { enabled: false };
  stageTransition: DisciplineTransitionRuleV1;
}

interface AccumulatedYellowRuleV1 {
  enabled: true;
  threshold: number;
  suspensionMatches: number;
  progression:
    | 'reset_after_suspension'
    | 'every_card_after_threshold'
    | 'repeat_every_threshold';
}

interface SuspensionRuleV1 {
  enabled: true;
  minimumMatches: number;
  allowManualExtension: boolean;
}

interface DisciplineTransitionRuleV1 {
  carryYellowCards: boolean;
  carryPendingSuspensions: boolean;
}
```

Дисциплинарный движок обрабатывает доменные события матча и создаёт `PlayerSuspension`. Применённая версия правил сохраняется у результата обработки, чтобы повторная синхронизация события была идемпотентной.

## Валидация

Проверка состоит из трёх уровней:

1. JSON Schema / discriminated union: форма, enum, диапазоны.
2. Доменная: ключи этапов существуют, тип правила совместим с типом этапа.
3. Сценарная: число квалифицировавшихся соответствует сетке, ограничения выполнимы, knockout определяет победителя.

Хранение произвольных `condition`, `expression`, `script`, SQL или JavaScript-полей запрещено контрактом.
