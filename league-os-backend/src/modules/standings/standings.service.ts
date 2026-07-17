import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeepPartial, In, IsNull, Repository } from 'typeorm';

import { BaseCrudService } from '../../common/base/base-crud.service';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import type {
  KnockoutStageRulesV1,
  StageRulesV1,
} from '../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentStageStatus } from '../tournament-stages/enums/tournament-stage-status.enum';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../tournament-teams/enums/tournament-team-status.enum';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import type { RecalculateStageStandingsDto } from './dto/recalculate-stage-standings.dto';
import { StandingEntity } from './entities/standing.entity';
import { RuleDrivenStandingsEngine } from './rule-driven-standings.engine';
import type { CalculatedStandingRow } from './types/standings-engine.type';
import { QualificationSnapshotEntity } from '../tournament-qualifications/entities/qualification-snapshot.entity';
import { KnockoutBracketSnapshotEntity } from '../tournament-knockout-brackets/entities/knockout-bracket-snapshot.entity';
import type {
  CrossGroupCriterionV1,
  QualificationRuleV1,
} from '../tournament-rules/types/tournament-rules-config.type';
import type {
  PublicBracketMatch,
  PublicCrossGroupRanking,
  PublicQualificationStatus,
  PublicStandingRow,
  PublicTournamentStageView,
  PublicTournamentView,
} from './types/public-tournament-view.type';
import { MatchResolutionType } from '../matches/enums/match-resolution-type.enum';
import type {
  KnockoutParticipantSourceV1,
} from '../tournament-rules/types/tournament-rules-config.type';
import type { QualificationSelectionReason } from '../tournament-qualifications/types/qualification-engine.type';
import type { TeamEntity } from '../teams/entities/team.entity';

const DISCIPLINARY_EVENT_TYPES = [
  MatchEventType.YELLOW_CARD,
  MatchEventType.SECOND_YELLOW_CARD,
  MatchEventType.RED_CARD,
];

export interface StandingView {
  position: number;
  team: { id: number; name: string; logoUrl?: string };
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  disciplinaryScore: number;
  tieBreakReason?: StandingEntity['tieBreakReason'];
  stageId?: number;
  groupId?: number;
  ruleVersionId?: number;
}

@Injectable()
export class StandingsService extends BaseCrudService<StandingEntity> {
  constructor(
    @InjectRepository(StandingEntity)
    private readonly standingsRepository: Repository<StandingEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchesRepository: Repository<MatchEntity>,
    @InjectRepository(TournamentStageEntity)
    private readonly stageRepository: Repository<TournamentStageEntity>,
    @InjectRepository(TournamentGroupEntity)
    private readonly groupRepository: Repository<TournamentGroupEntity>,
    @InjectRepository(TournamentStageParticipantEntity)
    private readonly participantRepository: Repository<TournamentStageParticipantEntity>,
    @InjectRepository(TournamentTeamEntity)
    private readonly tournamentTeamRepository: Repository<TournamentTeamEntity>,
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentRuleVersionEntity)
    private readonly ruleVersionRepository: Repository<TournamentRuleVersionEntity>,
    @InjectRepository(QualificationSnapshotEntity)
    private readonly qualificationSnapshotRepository: Repository<QualificationSnapshotEntity>,
    @InjectRepository(KnockoutBracketSnapshotEntity)
    private readonly bracketSnapshotRepository: Repository<KnockoutBracketSnapshotEntity>,
    private readonly dataSource: DataSource,
    private readonly engine: RuleDrivenStandingsEngine,
  ) {
    super(standingsRepository, 'Standing row');
  }

  override create(dto: DeepPartial<StandingEntity>): Promise<StandingEntity> {
    dto.goalDifference =
      Number(dto.goalsFor ?? 0) - Number(dto.goalsAgainst ?? 0);
    return super.create(dto);
  }

  override updateOne(
    query: Partial<StandingEntity>,
    dto: DeepPartial<StandingEntity>,
  ): Promise<StandingEntity> {
    if (dto.goalsFor !== undefined || dto.goalsAgainst !== undefined) {
      dto.goalDifference =
        Number(dto.goalsFor ?? 0) - Number(dto.goalsAgainst ?? 0);
    }
    return super.updateOne(query, dto);
  }

  async getPublicTournamentView(
    tournamentId: number,
  ): Promise<PublicTournamentView> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const stages = await this.stageRepository.find({
      where: { tournamentId },
      order: { order: 'ASC' },
    });
    if (!stages.length) {
      const [legacyStandings, legacyMatches] = await Promise.all([
        this.getLegacyTournamentStandings(tournamentId),
        this.matchesRepository.find({
          where: { tournamentId, stageId: IsNull() },
          relations: { homeTeam: true, awayTeam: true },
          order: { matchDatetime: 'ASC', id: 'ASC' },
        }),
      ]);
      const legacyRows = legacyStandings.map((row) =>
        this.publicStandingRow(row, 'not_applicable'),
      );
      return {
        tournament: this.publicTournament(tournament),
        activeStageId: null,
        stages: [
          {
            id: null,
            key: 'legacy',
            name: 'Турнирная таблица',
            type: TournamentStageType.ROUND_ROBIN,
            order: 1,
            status: 'legacy',
            groups: [],
            standings: legacyRows,
            crossGroupRankings: [],
            bracket: {
              confirmed: false,
              matches: legacyMatches
                .filter((match) => Boolean(match.roundType))
                .map((match) => this.publicMatch(match)),
            },
            empty: legacyRows.length === 0 && legacyMatches.length === 0,
          },
        ],
      };
    }

    const stageIds = stages.map((stage) => stage.id);
    const [groups, standingRows, participants, qualificationSnapshots, brackets] =
      await Promise.all([
        this.groupRepository.find({
          where: { stageId: In(stageIds) },
          order: { order: 'ASC' },
        }),
        this.standingsRepository.find({
          where: { tournamentId, stageId: In(stageIds) },
          relations: { team: true },
          order: { position: 'ASC', teamId: 'ASC' },
        }),
        this.participantRepository.find({
          where: { stageId: In(stageIds) },
          relations: { tournamentTeam: { team: true }, group: true },
          order: { tournamentTeamId: 'ASC' },
        }),
        this.qualificationSnapshotRepository.find({
          where: { tournamentId, isCurrent: true },
          relations: {
            entries: {
              tournamentTeam: { team: true },
              sourceGroup: true,
            },
          },
          order: { revision: 'DESC' },
        }),
        this.bracketSnapshotRepository.find({
          where: { tournamentId, isCurrent: true },
          relations: {
            plans: {
              match: { homeTeam: true, awayTeam: true },
            },
          },
          order: { revision: 'DESC' },
        }),
      ]);
    const activeRuleVersion = tournament.activeRuleVersionId
      ? await this.ruleVersionRepository.findOne({
          where: {
            id: tournament.activeRuleVersionId,
            tournamentId,
          },
        })
      : undefined;

    const views = stages.map((stage) => {
      const stageGroups = groups.filter((group) => group.stageId === stage.id);
      const stageParticipants = participants.filter(
        (participant) => participant.stageId === stage.id,
      );
      const qualification = qualificationSnapshots.find(
        (snapshot) => snapshot.fromStageId === stage.id,
      );
      const transition = activeRuleVersion?.config.transitions.find(
        (candidate) => candidate.fromStageKey === stage.key,
      );
      const bestPlacedRuleIds = new Set(
        transition?.qualification
          .filter(
            (rule) =>
              rule.type === 'best_placed_teams_between_groups' ||
              rule.type === 'best_placed_between_groups',
          )
          .map((rule) => rule.id) ?? [],
      );
      const qualifiedByTeam = new Map(
        qualification?.entries.map((entry) => [
          entry.tournamentTeam.teamId,
          entry,
        ]) ?? [],
      );
      const hasQualification = Boolean(
        activeRuleVersion?.config.transitions.some(
          (transition) => transition.fromStageKey === stage.key,
        ),
      );
      const statusFor = (teamId: number): PublicQualificationStatus => {
        const entry = qualifiedByTeam.get(teamId);
        if (entry) {
          return bestPlacedRuleIds.has(entry.qualificationRuleId)
            ? 'best_placed'
            : 'qualified';
        }
        if (!hasQualification) return 'not_applicable';
        return qualification ? 'not_qualified' : 'pending';
      };
      const toPublic = (standing: StandingEntity) =>
        this.publicStandingRow(
          this.toView(standing),
          statusFor(standing.teamId),
          qualifiedByTeam.get(standing.teamId)?.selectionReason,
        );

      const groupViews = stageGroups.map((group) => {
        const rows = standingRows
          .filter((row) => row.stageId === stage.id && row.groupId === group.id)
          .map(toPublic);
        if (!rows.length) {
          rows.push(
            ...stageParticipants
              .filter((participant) => participant.groupId === group.id)
              .map((participant, index) =>
                this.emptyPublicStanding(
                  participant.tournamentTeam.team,
                  index + 1,
                  statusFor(participant.tournamentTeam.teamId),
                ),
              ),
          );
        }
        return {
          id: group.id,
          key: group.key,
          name: group.name,
          order: group.order,
          standings: rows,
        };
      });
      const stageTable = standingRows
        .filter((row) => row.stageId === stage.id && !row.groupId)
        .map(toPublic);
      if (!stageTable.length && !stageGroups.length) {
        stageTable.push(
          ...stageParticipants.map((participant, index) =>
            this.emptyPublicStanding(
              participant.tournamentTeam.team,
              index + 1,
              statusFor(participant.tournamentTeam.teamId),
            ),
          ),
        );
      }

      const crossGroupRankings = transition
        ? transition.qualification
            .filter(
              (
                rule,
              ): rule is Extract<
                QualificationRuleV1,
                {
                  type:
                    | 'best_placed_teams_between_groups'
                    | 'best_placed_between_groups';
                }
              > =>
                rule.type === 'best_placed_teams_between_groups' ||
                rule.type === 'best_placed_between_groups',
            )
            .map((rule) =>
              this.crossGroupRanking(
                rule,
                groupViews,
                stageParticipants,
                qualification,
              ),
            )
        : [];
      const bracket = brackets.find((item) => item.stageId === stage.id);
      const bracketMatches = bracket
        ? (bracket.plans
          ?.slice()
          .sort((left, right) => left.order - right.order)
          .map((plan) =>
            plan.match
              ? this.publicMatch(plan.match, plan.homeSource, plan.awaySource)
              : {
                  position: plan.bracketPosition,
                  roundType: plan.roundType,
                  roundNumber: plan.roundNumber,
                  status: 'pending' as const,
                  homeSourceLabel: this.sourceLabel(plan.homeSource),
                  awaySourceLabel: this.sourceLabel(plan.awaySource),
                },
          ) ?? [])
        : this.pendingBracketStructure(
            stage.key,
            activeRuleVersion?.config.stages,
          );

      return {
        id: stage.id,
        key: stage.key,
        name: stage.name,
        type: stage.type,
        order: stage.order,
        status: stage.status,
        startDate: stage.startDate,
        endDate: stage.endDate,
        groups: groupViews,
        standings: stageTable,
        crossGroupRankings,
        bracket: {
          confirmed: Boolean(bracket),
          matches: bracketMatches,
        },
        empty:
          groupViews.every((group) => group.standings.length === 0) &&
          stageTable.length === 0 &&
          bracketMatches.length === 0,
      } satisfies PublicTournamentStageView;
    });

    const activeStage =
      stages.find((stage) => stage.status === TournamentStageStatus.ACTIVE) ??
      [...stages].reverse().find((stage) => {
        const view = views.find((candidate) => candidate.id === stage.id);
        return view && !view.empty;
      }) ??
      stages[0];

    return {
      tournament: this.publicTournament(tournament),
      activeStageId: activeStage?.id ?? null,
      stages: views,
    };
  }

  private publicTournament(tournament: TournamentEntity) {
    return {
      id: tournament.id,
      name: tournament.name,
      description: tournament.description,
      logoUrl: tournament.logoUrl,
      colorPrimary: tournament.colorPrimary,
      lifecycleStatus: tournament.lifecycleStatus,
    };
  }

  private publicStandingRow(
    row: StandingView,
    qualificationStatus: PublicQualificationStatus,
    selectionReason?: QualificationSelectionReason,
  ): PublicStandingRow {
    const tieBreak = row.tieBreakReason;
    const placementReason = selectionReason
      ? {
          type: 'qualification' as const,
          title:
            qualificationStatus === 'best_placed'
              ? 'Лучшая команда своего места'
              : 'Команда вышла в следующий этап',
          description: selectionReason.description,
        }
      : tieBreak
        ? {
            type: 'tie_break' as const,
            title: 'Позиция определена дополнительным критерием',
            description: tieBreak.description,
            tieBreak,
          }
        : qualificationStatus === 'pending'
          ? {
              type: 'pending' as const,
              title: 'Квалификация ещё не подтверждена',
              description:
                'Статус выхода появится после подтверждения результатов этапа.',
            }
          : {
              type: 'position' as const,
              title: `Место ${row.position}`,
              description: 'Позиция определена текущими показателями таблицы.',
            };
    return {
      position: row.position,
      team: row.team,
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      points: row.points,
      disciplinaryScore: row.disciplinaryScore,
      qualificationStatus,
      placementReason,
    };
  }

  private emptyPublicStanding(
    team: TeamEntity,
    position: number,
    qualificationStatus: PublicQualificationStatus,
  ): PublicStandingRow {
    return {
      position,
      team: {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        logoUrl: team.logoUrl,
      },
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      disciplinaryScore: 0,
      qualificationStatus,
      placementReason: {
        type: 'pending',
        title: 'Матчи ещё не сыграны',
        description: 'Позиция изменится после появления результатов.',
      },
    };
  }

  private crossGroupRanking(
    rule: Extract<
      QualificationRuleV1,
      {
        type:
          | 'best_placed_teams_between_groups'
          | 'best_placed_between_groups';
      }
    >,
    groups: PublicTournamentStageView['groups'],
    participants: TournamentStageParticipantEntity[],
    snapshot?: QualificationSnapshotEntity,
  ): PublicCrossGroupRanking {
    const participantByTeam = new Map(
      participants.map((participant) => [
        participant.tournamentTeam.teamId,
        participant,
      ]),
    );
    const selectedTeamIds = new Set(
      snapshot?.entries
        .filter((entry) => entry.qualificationRuleId === rule.id)
        .map((entry) => entry.tournamentTeam.teamId) ?? [],
    );
    const drawRankByTournamentTeam = new Map(
      snapshot?.resolutionInput.drawResults
        .filter((result) => result.qualificationRuleId === rule.id)
        .map((result) => [result.tournamentTeamId, result.rank]) ?? [],
    );
    const rows = groups
      .map((group) => {
        const row = group.standings.find(
          (standing) => standing.position === rule.sourcePosition,
        );
        return row ? { row, group } : undefined;
      })
      .filter(
        (
          item,
        ): item is {
          row: PublicStandingRow;
          group: PublicTournamentStageView['groups'][number];
        } => Boolean(item),
      )
      .sort((left, right) => {
        for (const criterion of rule.ranking.criteria) {
          const difference = this.compareCrossGroupCriterion(
            criterion,
            left.row,
            right.row,
            participantByTeam,
            drawRankByTournamentTeam,
          );
          if (difference !== 0) return difference;
        }
        return left.row.team.id - right.row.team.id;
      })
      .map(({ row, group }, index) => ({
        ...row,
        qualificationStatus: selectedTeamIds.has(row.team.id)
          ? ('best_placed' as const)
          : snapshot
            ? ('not_qualified' as const)
            : ('pending' as const),
        sourceGroup: {
          id: group.id,
          key: group.key,
          name: group.name,
        },
        crossGroupPosition: index + 1,
      }));
    return {
      id: rule.id,
      title:
        rule.sourcePosition === 2
          ? 'Рейтинг вторых мест'
          : `Рейтинг команд, занявших место №${rule.sourcePosition}`,
      sourcePosition: rule.sourcePosition,
      criteria: rule.ranking.criteria,
      rows,
    };
  }

  private compareCrossGroupCriterion(
    criterion: CrossGroupCriterionV1,
    left: PublicStandingRow,
    right: PublicStandingRow,
    participantByTeam: Map<number, TournamentStageParticipantEntity>,
    drawRankByTournamentTeam: Map<number, number>,
  ): number {
    const descending = (leftValue: number, rightValue: number) =>
      rightValue - leftValue;
    if (criterion === 'points') return descending(left.points, right.points);
    if (criterion === 'wins') return descending(left.wins, right.wins);
    if (criterion === 'goal_difference') {
      return descending(left.goalDifference, right.goalDifference);
    }
    if (criterion === 'goals_for') {
      return descending(left.goalsFor, right.goalsFor);
    }
    if (criterion === 'goals_against_asc') {
      return left.goalsAgainst - right.goalsAgainst;
    }
    if (criterion === 'disciplinary_score_asc') {
      return left.disciplinaryScore - right.disciplinaryScore;
    }
    if (criterion === 'draw_lots') {
      const leftTournamentTeamId =
        participantByTeam.get(left.team.id)?.tournamentTeamId;
      const rightTournamentTeamId =
        participantByTeam.get(right.team.id)?.tournamentTeamId;
      return (
        (drawRankByTournamentTeam.get(leftTournamentTeamId ?? 0) ??
          Number.MAX_SAFE_INTEGER) -
        (drawRankByTournamentTeam.get(rightTournamentTeamId ?? 0) ??
          Number.MAX_SAFE_INTEGER)
      );
    }
    return 0;
  }

  private publicMatch(
    match: MatchEntity,
    homeSource?: KnockoutParticipantSourceV1,
    awaySource?: KnockoutParticipantSourceV1,
  ): PublicBracketMatch {
    const hasOfficialResult = Boolean(
      match.resultOfficialAt || match.status === MatchStatus.FINISHED,
    );
    const administrativeDecision =
      match.resolutionType === MatchResolutionType.TECHNICAL
        ? {
            type: 'technical_result' as const,
            label: 'Технический результат',
          }
        : match.resolutionType === MatchResolutionType.WALKOVER
          ? { type: 'walkover' as const, label: 'Победа без игры' }
          : undefined;
    return {
      id: match.id,
      position: match.bracketPosition ?? match.round ?? `match-${match.id}`,
      roundType: match.roundType ?? ('round_robin' as never),
      roundNumber: match.roundNumber ?? 1,
      status: match.status,
      homeTeam: match.homeTeam
        ? {
            id: match.homeTeam.id,
            name: match.homeTeam.name,
            shortName: match.homeTeam.shortName,
            logoUrl: match.homeTeam.logoUrl,
          }
        : undefined,
      awayTeam: match.awayTeam
        ? {
            id: match.awayTeam.id,
            name: match.awayTeam.name,
            shortName: match.awayTeam.shortName,
            logoUrl: match.awayTeam.logoUrl,
          }
        : undefined,
      homeSourceLabel: this.sourceLabel(
        homeSource ?? match.homeParticipantSource,
      ),
      awaySourceLabel: this.sourceLabel(
        awaySource ?? match.awayParticipantSource,
      ),
      regularTime: hasOfficialResult
        ? {
            home: match.regularTimeHomeScore ?? match.homeScore,
            away: match.regularTimeAwayScore ?? match.awayScore,
          }
        : undefined,
      extraTime:
        match.extraTimeHomeScore != null && match.extraTimeAwayScore != null
          ? {
              home: match.extraTimeHomeScore,
              away: match.extraTimeAwayScore,
            }
          : undefined,
      penalties:
        match.penaltyHomeScore != null && match.penaltyAwayScore != null
          ? {
              home: match.penaltyHomeScore,
              away: match.penaltyAwayScore,
              homeKicksTaken: match.penaltyHomeKicksTaken,
              awayKicksTaken: match.penaltyAwayKicksTaken,
            }
          : undefined,
      resolutionType: match.resolutionType,
      winnerTeamId: match.winnerTeamId,
      administrativeDecision,
    };
  }

  private sourceLabel(source?: KnockoutParticipantSourceV1): string {
    if (!source) return 'Участник ещё не определён';
    if (source.type === 'team') return `Команда #${source.teamId}`;
    if (source.type === 'qualification_position') {
      return `Место квалификации №${source.selectionOrder}`;
    }
    return `${source.outcome === 'winner' ? 'Победитель' : 'Проигравший'} ${source.bracketPosition}`;
  }

  private pendingBracketStructure(
    stageKey: string,
    stages?: StageRulesV1[],
  ): PublicBracketMatch[] {
    const rules = stages?.find(
      (stage): stage is KnockoutStageRulesV1 =>
        stage.stageKey === stageKey && stage.type === 'knockout',
    );
    if (!rules) return [];

    const matches: PublicBracketMatch[] = [];
    let teamsInRound = rules.bracket.size;
    let roundNumber = 1;
    let previousPositions: string[] = [];

    while (teamsInRound >= 2) {
      const matchCount = teamsInRound / 2;
      const roundType = this.roundTypeForSize(teamsInRound);
      const positions = Array.from({ length: matchCount }, (_, index) =>
        this.bracketPosition(roundType, index + 1),
      );

      if (
        teamsInRound === 2 &&
        rules.bracket.placementMatch === 'third_place' &&
        previousPositions.length === 2
      ) {
        matches.push({
          position: 'THIRD_PLACE',
          roundType: MatchRoundType.THIRD_PLACE,
          roundNumber,
          status: 'pending',
          homeSourceLabel: `Проигравший ${previousPositions[0]}`,
          awaySourceLabel: `Проигравший ${previousPositions[1]}`,
        });
      }

      positions.forEach((position, index) => {
        const sourceLabels = previousPositions.length
          ? [
              `Победитель ${previousPositions[index * 2]}`,
              `Победитель ${previousPositions[index * 2 + 1]}`,
            ]
          : this.initialSeedLabels(rules, index);
        matches.push({
          position,
          roundType,
          roundNumber,
          status: 'pending',
          homeSourceLabel: sourceLabels[0],
          awaySourceLabel: sourceLabels[1],
        });
      });

      previousPositions = positions;
      teamsInRound /= 2;
      roundNumber += 1;
    }

    return matches;
  }

  private initialSeedLabels(
    rules: KnockoutStageRulesV1,
    matchIndex: number,
  ): [string, string] {
    if (
      rules.bracket.size === 4 &&
      rules.bracket.seeding.type === 'best_eligible_opponent'
    ) {
      return matchIndex === 0
        ? [
            'Лучшая команда среди вторых мест',
            'Лучший доступный победитель другой группы',
          ]
        : ['Оставшийся победитель группы', 'Оставшийся победитель группы'];
    }
    return [
      `Участник посева №${matchIndex * 2 + 1}`,
      `Участник посева №${matchIndex * 2 + 2}`,
    ];
  }

  private roundTypeForSize(size: number): MatchRoundType {
    const types: Record<number, MatchRoundType> = {
      32: MatchRoundType.ROUND_OF_32,
      16: MatchRoundType.ROUND_OF_16,
      8: MatchRoundType.QUARTER_FINAL,
      4: MatchRoundType.SEMI_FINAL,
      2: MatchRoundType.FINAL,
    };
    return types[size];
  }

  private bracketPosition(
    roundType: MatchRoundType,
    index: number,
  ): string {
    const prefixes: Partial<Record<MatchRoundType, string>> = {
      [MatchRoundType.ROUND_OF_32]: 'R32',
      [MatchRoundType.ROUND_OF_16]: 'R16',
      [MatchRoundType.QUARTER_FINAL]: 'QF',
      [MatchRoundType.SEMI_FINAL]: 'SF',
    };
    return roundType === MatchRoundType.FINAL
      ? 'FINAL'
      : `${prefixes[roundType]}-${index}`;
  }

  async getStageStandings(
    tournamentId: number,
    stageId: number,
    groupId?: number,
  ): Promise<StandingView[]> {
    const standings = await this.standingsRepository.find({
      where: {
        tournamentId,
        stageId,
        groupId: groupId ?? IsNull(),
      },
      relations: { team: true },
      order: { position: 'ASC', teamId: 'ASC' },
    });
    return standings.map((standing) => this.toView(standing));
  }

  async getLegacyTournamentStandings(
    tournamentId: number,
  ): Promise<StandingView[]> {
    let standings = await this.standingsRepository.find({
      where: { tournamentId, stageId: IsNull() },
      relations: { team: true },
      order: {
        points: 'DESC',
        goalDifference: 'DESC',
        goalsFor: 'DESC',
        teamId: 'ASC',
      },
    });
    if (!standings.length) {
      const legacyStage = await this.stageRepository.findOne({
        where: {
          tournamentId,
          key: 'legacy-main',
        },
      });
      if (legacyStage) {
        standings = await this.standingsRepository.find({
          where: {
            tournamentId,
            stageId: legacyStage.id,
          },
          relations: { team: true },
          order: {
            points: 'DESC',
            goalDifference: 'DESC',
            goalsFor: 'DESC',
            teamId: 'ASC',
          },
        });
      }
    }
    return standings.map((standing, index) =>
      this.toView({ ...standing, position: index + 1 }),
    );
  }

  async recalculateStage(
    tournamentId: number,
    stageId: number,
    groupId: number | undefined,
    dto: RecalculateStageStandingsDto = {},
  ): Promise<StandingView[]> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const stages = manager.getRepository(TournamentStageEntity);
      const groups = manager.getRepository(TournamentGroupEntity);
      const participants = manager.getRepository(
        TournamentStageParticipantEntity,
      );
      const tournaments = manager.getRepository(TournamentEntity);
      const ruleVersions = manager.getRepository(TournamentRuleVersionEntity);
      const matches = manager.getRepository(MatchEntity);
      const events = manager.getRepository(MatchEventEntity);
      const standings = manager.getRepository(StandingEntity);

      const stage = await stages.findOne({
        where: { id: stageId, tournamentId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!stage) throw new NotFoundException('Tournament stage not found');
      if (stage.type === TournamentStageType.KNOCKOUT) {
        throw new BadRequestException(
          'Knockout matches cannot be calculated as a standings table',
        );
      }
      if (stage.type === TournamentStageType.GROUP_STAGE && !groupId) {
        throw new BadRequestException(
          'groupId is required for a group-stage standings table',
        );
      }
      if (groupId) {
        const group = await groups.findOne({
          where: { id: groupId, stageId },
        });
        if (!group) throw new NotFoundException('Tournament group not found');
      }

      const tournament = await tournaments.findOne({
        where: { id: tournamentId },
      });
      if (!tournament) throw new NotFoundException('Tournament not found');
      const ruleVersionId = dto.ruleVersionId ?? tournament.activeRuleVersionId;
      if (!ruleVersionId) {
        throw new ConflictException(
          'Tournament has no active rule version for standings calculation',
        );
      }
      const ruleVersion = await ruleVersions.findOne({
        where: { id: ruleVersionId, tournamentId },
      });
      if (!ruleVersion) throw new NotFoundException('Rule version not found');
      const stageRules = ruleVersion.config.stages.find(
        (candidate) => candidate.stageKey === stage.key,
      );
      this.assertStandingsRules(stage, stageRules);

      const participantRows = await participants.find({
        where: {
          stageId,
          ...(groupId ? { groupId } : {}),
        },
        relations: { tournamentTeam: { team: true } },
        order: { seedNumber: 'ASC', tournamentTeamId: 'ASC' },
      });
      const teamIds = participantRows.map(
        (participant) => participant.tournamentTeam.teamId,
      );
      if (new Set(teamIds).size !== teamIds.length) {
        throw new ConflictException('Stage contains duplicate teams');
      }

      const matchRows = await matches.find({
        where: {
          tournamentId,
          stageId,
          groupId: groupId ?? IsNull(),
          status: MatchStatus.FINISHED,
        },
        order: { id: 'ASC' },
      });
      const scopedMatches = matchRows.filter(
        (match) =>
          match.status === MatchStatus.FINISHED &&
          match.stageId === stageId &&
          (groupId ? match.groupId === groupId : !match.groupId),
      );
      const teamIdSet = new Set(teamIds);
      if (
        scopedMatches.some(
          (match) =>
            !teamIdSet.has(match.homeTeamId) ||
            !teamIdSet.has(match.awayTeamId),
        )
      ) {
        throw new ConflictException(
          'A standings match contains a team outside the stage or group',
        );
      }

      const disciplinaryEvents = scopedMatches.length
        ? await events.find({
            where: {
              matchId: In(scopedMatches.map((match) => match.id)),
              eventType: In(DISCIPLINARY_EVENT_TYPES),
              isCancelled: false,
            },
            order: { id: 'ASC' },
          })
        : [];
      const existing = await standings.find({
        where: { stageId, groupId: groupId ?? IsNull() },
      });
      const manualRanks = this.mergeResolutionRanks(
        existing,
        dto.manualDecisions,
        'manualDecisionRank',
        teamIdSet,
      );
      const drawRanks = this.mergeResolutionRanks(
        existing,
        dto.drawResults,
        'drawRank',
        teamIdSet,
      );

      const calculated = this.engine.calculate({
        teamIds,
        matches: scopedMatches,
        scoring: stageRules.scoring,
        tieBreakers: stageRules.standings.tieBreakers,
        disciplinaryEvents: disciplinaryEvents.map((event) => ({
          teamId: event.teamId,
          eventType: event.eventType as
            | 'yellow_card'
            | 'second_yellow_card'
            | 'red_card',
        })),
        disciplinaryWeights: stageRules.standings.disciplinaryScore,
        manualDecisionRanks: manualRanks,
        drawRanks,
        drawSeed:
          dto.drawSeed ?? ruleVersion.id * 100_000 + stageId + (groupId ?? 0),
      });

      await standings.delete({ stageId, groupId: groupId ?? IsNull() });
      await standings.save(
        calculated.map((row) =>
          standings.create({
            tournamentId,
            stageId,
            groupId,
            ruleVersionId: ruleVersion.id,
            teamId: row.teamId,
            position: row.position,
            played: row.played,
            wins: row.wins,
            draws: row.draws,
            losses: row.losses,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            goalDifference: row.goalDifference,
            points: row.points,
            disciplinaryScore: row.disciplinaryScore,
            manualDecisionRank: row.manualDecisionRank,
            drawRank: row.drawRank,
            tieBreakReason: row.tieBreakReason,
          }),
        ),
      );

      const teamById = new Map(
        participantRows.map((participant) => [
          participant.tournamentTeam.teamId,
          participant.tournamentTeam.team,
        ]),
      );
      return calculated.map((row) =>
        this.calculatedToView(
          row,
          teamById.get(row.teamId),
          stageId,
          groupId,
          ruleVersion.id,
        ),
      );
    });
  }

  async recalculateByTournament(
    tournamentId: number,
  ): Promise<StandingEntity[] | StandingView[]> {
    const stages = await this.stageRepository.find({
      where: { tournamentId },
      order: { order: 'ASC' },
    });
    if (stages.length > 0) {
      const result: StandingView[] = [];
      for (const stage of stages) {
        if (stage.type === TournamentStageType.KNOCKOUT) continue;
        if (stage.type === TournamentStageType.GROUP_STAGE) {
          const groups = await this.groupRepository.find({
            where: { stageId: stage.id },
            order: { order: 'ASC' },
          });
          for (const group of groups) {
            result.push(
              ...(await this.recalculateStage(
                tournamentId,
                stage.id,
                group.id,
              )),
            );
          }
        } else {
          result.push(
            ...(await this.recalculateStage(tournamentId, stage.id, undefined)),
          );
        }
      }
      return result;
    }
    return this.recalculateLegacyTournament(tournamentId);
  }

  private async recalculateLegacyTournament(
    tournamentId: number,
  ): Promise<StandingEntity[]> {
    const [matches, tournamentTeams] = await Promise.all([
      this.matchesRepository.find({
        where: {
          tournamentId,
          stageId: IsNull(),
          status: MatchStatus.FINISHED,
        },
      }),
      this.tournamentTeamRepository.find({
        where: { tournamentId, status: TournamentTeamStatus.ACTIVE },
      }),
    ]);
    const calculated = this.engine.calculate({
      teamIds: tournamentTeams.map((team) => team.teamId),
      matches,
      scoring: { win: 3, draw: 1, loss: 0 },
      tieBreakers: [
        { type: 'goal_difference', scope: 'all_matches' },
        { type: 'goals_for', scope: 'all_matches' },
        { type: 'draw' },
      ],
      drawSeed: tournamentId,
    });
    await this.standingsRepository.delete({
      tournamentId,
      stageId: IsNull(),
    });
    return this.standingsRepository.save(
      calculated.map((row) =>
        this.standingsRepository.create({
          ...row,
          tournamentId,
        }),
      ),
    );
  }

  private assertStandingsRules(
    stage: TournamentStageEntity,
    rules: StageRulesV1 | undefined,
  ): asserts rules is Exclude<StageRulesV1, { type: 'knockout' }> {
    if (!rules) {
      throw new ConflictException(`No rules found for stage ${stage.key}`);
    }
    if (rules.type === 'knockout' || rules.type !== String(stage.type)) {
      throw new ConflictException(
        'Stage rules are incompatible with standings',
      );
    }
  }

  private mergeResolutionRanks(
    existing: StandingEntity[],
    supplied: Array<{ teamId: number; rank: number }> | undefined,
    field: 'manualDecisionRank' | 'drawRank',
    validTeamIds: Set<number>,
  ): Map<number, number> {
    const result = new Map<number, number>();
    existing.forEach((standing) => {
      const value = standing[field];
      if (value !== undefined) result.set(standing.teamId, value);
    });
    const suppliedTeamIds = new Set<number>();
    const suppliedRanks = new Set<number>();
    supplied?.forEach((resolution) => {
      if (!validTeamIds.has(resolution.teamId)) {
        throw new BadRequestException(
          `Resolution team ${resolution.teamId} is outside the table`,
        );
      }
      if (
        suppliedTeamIds.has(resolution.teamId) ||
        suppliedRanks.has(resolution.rank)
      ) {
        throw new BadRequestException(
          'Resolution team ids and ranks must be unique',
        );
      }
      suppliedTeamIds.add(resolution.teamId);
      suppliedRanks.add(resolution.rank);
      result.set(resolution.teamId, resolution.rank);
    });
    return result;
  }

  private calculatedToView(
    row: CalculatedStandingRow,
    team: { id: number; name: string; logoUrl?: string } | undefined,
    stageId: number,
    groupId: number | undefined,
    ruleVersionId: number,
  ): StandingView {
    return {
      ...row,
      team: team ?? { id: row.teamId, name: `Team ${row.teamId}` },
      stageId,
      groupId,
      ruleVersionId,
    };
  }

  private toView(standing: StandingEntity): StandingView {
    return {
      position: standing.position ?? 0,
      team: {
        id: standing.teamId,
        name: standing.team?.name ?? `Team ${standing.teamId}`,
        logoUrl: standing.team?.logoUrl,
      },
      played: standing.played,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      goalsFor: standing.goalsFor,
      goalsAgainst: standing.goalsAgainst,
      goalDifference: standing.goalDifference,
      points: standing.points,
      disciplinaryScore: standing.disciplinaryScore,
      tieBreakReason: standing.tieBreakReason,
      stageId: standing.stageId,
      groupId: standing.groupId,
      ruleVersionId: standing.ruleVersionId,
    };
  }
}
