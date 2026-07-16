import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { MatchEntity } from '../matches/entities/match.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import type {
  DisciplineRulesV1,
  StageRulesV1,
  SuspensionRuleV1,
  TournamentRulesConfig,
} from '../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { DisciplineEngine } from './discipline.engine';
import { PlayerSuspensionEntity } from './entities/player-suspension.entity';
import { PlayerSuspensionReason } from './enums/player-suspension-reason.enum';
import { PlayerSuspensionStatus } from './enums/player-suspension-status.enum';

const LEGACY_DISCIPLINE_RULES: DisciplineRulesV1 = {
  accumulatedYellows: {
    enabled: true,
    threshold: 4,
    suspensionMatches: 1,
    progression: 'reset_after_suspension',
  },
  secondYellowInMatch: {
    enabled: true,
    minimumMatches: 1,
    allowManualExtension: true,
  },
  directRed: {
    enabled: true,
    minimumMatches: 1,
    allowManualExtension: true,
  },
  stageTransition: {
    carryYellowCards: true,
    carryPendingSuspensions: true,
  },
};

export interface PlayerDisciplineEligibility {
  suspension?: PlayerSuspensionEntity;
  yellowCardsInScope: number;
  yellowWarningThreshold?: number;
}

interface DisciplineContext {
  stages: TournamentStageEntity[];
  config?: TournamentRulesConfig;
  currentStage?: TournamentStageEntity;
  currentRules: DisciplineRulesV1;
}

@Injectable()
export class PlayerSuspensionsService {
  constructor(
    @InjectRepository(PlayerSuspensionEntity)
    private readonly suspensionRepository: Repository<PlayerSuspensionEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(MatchEventEntity)
    private readonly eventRepository: Repository<MatchEventEntity>,
    @InjectRepository(TournamentStageEntity)
    private readonly stageRepository: Repository<TournamentStageEntity>,
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentRuleVersionEntity)
    private readonly ruleVersionRepository: Repository<TournamentRuleVersionEntity>,
    private readonly engine: DisciplineEngine,
  ) {}

  async listActiveForTournament(tournamentId: number) {
    const rows = await this.suspensionRepository.find({
      where: {
        tournamentId,
        status: PlayerSuspensionStatus.ACTIVE,
      },
      relations: { player: true, team: true, stage: true },
      order: { stageId: 'ASC', teamId: 'ASC', playerId: 'ASC' },
    });
    return rows.map((suspension) => ({
      id: suspension.id,
      stageId: suspension.stageId,
      stageName: suspension.stage?.name,
      player: {
        id: suspension.playerId,
        name: [
          suspension.player.lastName,
          suspension.player.firstName,
          suspension.player.middleName,
        ]
          .filter(Boolean)
          .join(' '),
      },
      team: {
        id: suspension.teamId,
        name: suspension.team.name,
        logoUrl: suspension.team.logoUrl,
      },
      reason: suspension.reason,
      matchesRequired: suspension.matchesRequired,
      matchesServed: suspension.matchesServed,
      matchesRemaining: Math.max(
        suspension.matchesRequired - suspension.matchesServed,
        0,
      ),
      sourceMatchId: suspension.sourceMatchId,
      manualDecisionId: suspension.manualDecisionId,
    }));
  }

  async applyCardEvent(params: {
    match: MatchEntity;
    teamId: number;
    playerId: number;
    eventType: MatchEventType;
  }): Promise<PlayerSuspensionEntity | undefined> {
    const { match, teamId, playerId, eventType } = params;
    if (!this.isCardEvent(eventType)) return undefined;

    const context = await this.loadContext(match);
    if (eventType === MatchEventType.YELLOW_CARD) {
      const rule = context.currentRules.accumulatedYellows;
      if (!rule.enabled) return undefined;

      const stageIds = this.yellowCardStageIds(context);
      const yellowCards = await this.countYellowCards(
        match.tournamentId,
        teamId,
        playerId,
        stageIds,
      );
      const accumulated = await this.suspensionRepository.find({
        where: {
          tournamentId: match.tournamentId,
          teamId,
          playerId,
          reason: PlayerSuspensionReason.ACCUMULATED_YELLOWS,
        },
      });
      const shouldCreate = this.engine.shouldCreateAccumulatedSuspension({
        yellowCards,
        existingSuspensions: accumulated.length,
        hasActiveAccumulatedSuspension: accumulated.some(
          (item) => item.status === PlayerSuspensionStatus.ACTIVE,
        ),
        rule,
      });
      if (!shouldCreate) return undefined;

      return this.createSuspension({
        match,
        teamId,
        playerId,
        reason: PlayerSuspensionReason.ACCUMULATED_YELLOWS,
        matchesRequired: rule.suspensionMatches,
      });
    }

    if (eventType === MatchEventType.SECOND_YELLOW_CARD) {
      const rule = context.currentRules.secondYellowInMatch;
      if (!rule.enabled) return undefined;
      return this.createSuspension({
        match,
        teamId,
        playerId,
        reason: PlayerSuspensionReason.SECOND_YELLOW_CARD,
        matchesRequired: rule.minimumMatches,
      });
    }

    const rule = context.currentRules.directRed;
    if (!rule.enabled) return undefined;
    return this.createSuspension({
      match,
      teamId,
      playerId,
      reason: PlayerSuspensionReason.DIRECT_RED,
      matchesRequired: rule.minimumMatches,
    });
  }

  async getEligibilityForMatch(
    match: MatchEntity,
    teamId: number,
    playerIds: number[],
  ): Promise<Map<number, PlayerDisciplineEligibility>> {
    if (!playerIds.length) return new Map();
    const context = await this.loadContext(match);
    const suspensions = await this.prepareSuspensionsForStage(
      match,
      teamId,
      playerIds,
      context,
    );
    const stageIds = this.yellowCardStageIds(context);
    const result = new Map<number, PlayerDisciplineEligibility>();

    await Promise.all(
      playerIds.map(async (playerId) => {
        const yellowCardsInScope = await this.countYellowCards(
          match.tournamentId,
          teamId,
          playerId,
          stageIds,
        );
        const yellowRule = context.currentRules.accumulatedYellows;
        result.set(playerId, {
          suspension: suspensions.find(
            (suspension) =>
              suspension.playerId === playerId &&
              suspension.status === PlayerSuspensionStatus.ACTIVE &&
              (suspension.stageId === match.stageId ||
                suspension.stageId === undefined ||
                suspension.stageId === null),
          ),
          yellowCardsInScope,
          yellowWarningThreshold: yellowRule.enabled
            ? yellowRule.threshold - 1
            : undefined,
        });
      }),
    );

    return result;
  }

  async revertCardEvent(params: {
    match: MatchEntity;
    teamId: number;
    playerId: number;
    eventType: MatchEventType;
  }): Promise<void> {
    if (!this.isCardEvent(params.eventType)) return;
    const context = await this.loadContext(params.match);

    if (params.eventType === MatchEventType.YELLOW_CARD) {
      const rule = context.currentRules.accumulatedYellows;
      if (!rule.enabled) return;
      const yellowCards = await this.countYellowCards(
        params.match.tournamentId,
        params.teamId,
        params.playerId,
        this.yellowCardStageIds(context),
      );
      const required = this.engine.requiredAccumulatedSuspensions(
        yellowCards,
        rule,
      );
      const suspensions = await this.suspensionRepository.find({
        where: {
          tournamentId: params.match.tournamentId,
          teamId: params.teamId,
          playerId: params.playerId,
          reason: PlayerSuspensionReason.ACCUMULATED_YELLOWS,
        },
        order: { id: 'DESC' },
      });
      const effective = suspensions.filter(
        (item) => item.status !== PlayerSuspensionStatus.CANCELLED,
      );
      const surplus = Math.max(effective.length - required, 0);
      const cancellable = effective
        .filter(
          (item) =>
            item.status === PlayerSuspensionStatus.ACTIVE &&
            item.matchesServed === 0,
        )
        .slice(0, surplus);
      this.cancelSuspensions(cancellable);
      if (cancellable.length) {
        await this.suspensionRepository.save(cancellable);
      }
      return;
    }

    const reason =
      params.eventType === MatchEventType.SECOND_YELLOW_CARD
        ? PlayerSuspensionReason.SECOND_YELLOW_CARD
        : PlayerSuspensionReason.DIRECT_RED;
    const suspension = await this.suspensionRepository.findOne({
      where: {
        sourceMatchId: params.match.id,
        playerId: params.playerId,
        reason,
        status: PlayerSuspensionStatus.ACTIVE,
      },
    });
    if (suspension && suspension.matchesServed === 0) {
      this.cancelSuspensions([suspension]);
      await this.suspensionRepository.save(suspension);
    }
  }

  async serveSuspensionsForMatch(matchId: number): Promise<number> {
    const match = await this.matchRepository.findOne({
      where: { id: matchId },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (!match.resultOfficialAt) {
      throw new ConflictException(
        'Suspensions can be served only by an officially completed match',
      );
    }

    const teamIds = [match.homeTeamId, match.awayTeamId].filter(
      (teamId): teamId is number => Boolean(teamId),
    );
    if (!teamIds.length) return 0;
    const active = await this.suspensionRepository.find({
      where: {
        tournamentId: match.tournamentId,
        teamId: In(teamIds),
        status: PlayerSuspensionStatus.ACTIVE,
      },
    });
    const applicable = active.filter(
      (suspension) =>
        suspension.sourceMatchId !== match.id &&
        (suspension.stageId === match.stageId ||
          suspension.stageId === undefined ||
          suspension.stageId === null),
    );
    const now = new Date();
    for (const suspension of applicable) {
      suspension.matchesServed += 1;
      if (suspension.matchesServed >= suspension.matchesRequired) {
        suspension.status = PlayerSuspensionStatus.SERVED;
        suspension.servedAt = now;
      }
    }
    if (applicable.length) await this.suspensionRepository.save(applicable);
    return applicable.length;
  }

  async extend(
    tournamentId: number,
    suspensionId: number,
    extraMatches: number,
    manualDecisionId: number,
  ): Promise<PlayerSuspensionEntity> {
    const suspension = await this.suspensionRepository.findOne({
      where: { id: suspensionId, tournamentId },
    });
    if (!suspension) throw new NotFoundException('Player suspension not found');
    if (suspension.status !== PlayerSuspensionStatus.ACTIVE) {
      throw new ConflictException('Only an active suspension can be extended');
    }

    const rules = await this.getRulesForSuspension(suspension);
    suspension.matchesRequired = this.engine.extendMatchesRequired(
      suspension.matchesRequired,
      extraMatches,
      rules,
    );
    suspension.manualDecisionId = manualDecisionId;
    return this.suspensionRepository.save(suspension);
  }

  async cancelByDecision(
    tournamentId: number,
    suspensionId: number,
    manualDecisionId: number,
  ): Promise<PlayerSuspensionEntity> {
    const suspension = await this.suspensionRepository.findOne({
      where: { id: suspensionId, tournamentId },
    });
    if (!suspension) throw new NotFoundException('Player suspension not found');
    if (suspension.status !== PlayerSuspensionStatus.ACTIVE) {
      throw new ConflictException('Only an active suspension can be cancelled');
    }
    suspension.status = PlayerSuspensionStatus.CANCELLED;
    suspension.cancelledAt = new Date();
    suspension.manualDecisionId = manualDecisionId;
    return this.suspensionRepository.save(suspension);
  }

  async undoExtension(
    tournamentId: number,
    suspensionId: number,
    extraMatches: number,
  ): Promise<PlayerSuspensionEntity> {
    const suspension = await this.suspensionRepository.findOne({
      where: { id: suspensionId, tournamentId },
    });
    if (!suspension) throw new NotFoundException('Player suspension not found');
    suspension.matchesRequired = Math.max(
      suspension.matchesServed || 1,
      suspension.matchesRequired - extraMatches,
    );
    suspension.manualDecisionId = undefined;
    if (
      suspension.status === PlayerSuspensionStatus.SERVED &&
      suspension.matchesServed < suspension.matchesRequired
    ) {
      suspension.status = PlayerSuspensionStatus.ACTIVE;
      suspension.servedAt = undefined;
    }
    return this.suspensionRepository.save(suspension);
  }

  async restoreCancelled(
    tournamentId: number,
    suspensionId: number,
  ): Promise<PlayerSuspensionEntity> {
    const suspension = await this.suspensionRepository.findOne({
      where: { id: suspensionId, tournamentId },
    });
    if (!suspension) throw new NotFoundException('Player suspension not found');
    if (suspension.status !== PlayerSuspensionStatus.CANCELLED) {
      throw new ConflictException('Suspension is not cancelled');
    }
    suspension.status =
      suspension.matchesServed >= suspension.matchesRequired
        ? PlayerSuspensionStatus.SERVED
        : PlayerSuspensionStatus.ACTIVE;
    suspension.cancelledAt = undefined;
    suspension.manualDecisionId = undefined;
    return this.suspensionRepository.save(suspension);
  }

  private async createSuspension(params: {
    match: MatchEntity;
    teamId: number;
    playerId: number;
    reason: PlayerSuspensionReason;
    matchesRequired: number;
  }): Promise<PlayerSuspensionEntity> {
    const existing = await this.suspensionRepository.findOne({
      where: {
        sourceMatchId: params.match.id,
        playerId: params.playerId,
        reason: params.reason,
      },
    });
    if (existing) return existing;

    return this.suspensionRepository.save(
      this.suspensionRepository.create({
        tournamentId: params.match.tournamentId,
        stageId: params.match.stageId,
        playerId: params.playerId,
        teamId: params.teamId,
        reason: params.reason,
        matchesRequired: params.matchesRequired,
        matchesServed: 0,
        status: PlayerSuspensionStatus.ACTIVE,
        sourceMatchId: params.match.id,
      }),
    );
  }

  private async prepareSuspensionsForStage(
    match: MatchEntity,
    teamId: number,
    playerIds: number[],
    context: DisciplineContext,
  ): Promise<PlayerSuspensionEntity[]> {
    const active = await this.suspensionRepository.find({
      where: {
        tournamentId: match.tournamentId,
        teamId,
        playerId: In(playerIds),
        status: PlayerSuspensionStatus.ACTIVE,
      },
    });
    if (!match.stageId || !context.currentStage) return active;

    const stageById = new Map(context.stages.map((stage) => [stage.id, stage]));
    const changed: PlayerSuspensionEntity[] = [];
    for (const suspension of active) {
      if (suspension.stageId === match.stageId) continue;
      if (!suspension.stageId) {
        suspension.stageId = match.stageId;
        changed.push(suspension);
        continue;
      }

      const sourceStage = stageById.get(suspension.stageId);
      if (!sourceStage || sourceStage.order >= context.currentStage.order) {
        continue;
      }
      const sourceRules = this.findStageRules(
        context.config,
        sourceStage.key,
      )?.discipline;
      const transition =
        sourceRules?.stageTransition ?? LEGACY_DISCIPLINE_RULES.stageTransition;
      if (this.engine.shouldCarryPendingSuspension(transition)) {
        suspension.stageId = match.stageId;
      } else {
        suspension.status = PlayerSuspensionStatus.CANCELLED;
        suspension.cancelledAt = new Date();
      }
      changed.push(suspension);
    }
    if (changed.length) await this.suspensionRepository.save(changed);
    return active;
  }

  private yellowCardStageIds(context: DisciplineContext): number[] | undefined {
    if (!context.currentStage) return undefined;
    const currentIndex = context.stages.findIndex(
      (stage) => stage.id === context.currentStage?.id,
    );
    const stageIds = [context.currentStage.id];
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const previousStage = context.stages[index];
      const previousRules = this.findStageRules(
        context.config,
        previousStage.key,
      )?.discipline;
      if (!previousRules?.stageTransition.carryYellowCards) break;
      stageIds.push(previousStage.id);
    }
    return stageIds;
  }

  private async countYellowCards(
    tournamentId: number,
    teamId: number,
    playerId: number,
    stageIds?: number[],
  ): Promise<number> {
    const query = this.eventRepository
      .createQueryBuilder('event')
      .innerJoin(MatchEntity, 'match', 'match.id = event.match_id')
      .where('match.tournament_id = :tournamentId', { tournamentId })
      .andWhere('event.team_id = :teamId', { teamId })
      .andWhere('event.player_id = :playerId', { playerId })
      .andWhere('event.eventType = :eventType', {
        eventType: MatchEventType.YELLOW_CARD,
      })
      .andWhere('event.is_cancelled = false');
    if (stageIds) {
      query.andWhere('match.stage_id IN (:...stageIds)', { stageIds });
    }
    return query.getCount();
  }

  private async loadContext(match: MatchEntity): Promise<DisciplineContext> {
    const stages = await this.stageRepository.find({
      where: { tournamentId: match.tournamentId },
      order: { order: 'ASC' },
    });
    const currentStage = stages.find((stage) => stage.id === match.stageId);
    const tournament = await this.tournamentRepository.findOne({
      where: { id: match.tournamentId },
    });
    const ruleVersionId =
      match.effectiveRuleVersionId ?? tournament?.activeRuleVersionId;
    const version = ruleVersionId
      ? await this.ruleVersionRepository.findOne({
          where: { id: ruleVersionId, tournamentId: match.tournamentId },
        })
      : undefined;
    const stageRules = currentStage
      ? this.findStageRules(version?.config, currentStage.key)
      : undefined;
    return {
      stages,
      config: version?.config,
      currentStage,
      currentRules: stageRules?.discipline ?? LEGACY_DISCIPLINE_RULES,
    };
  }

  private findStageRules(
    config: TournamentRulesConfig | undefined,
    stageKey: string,
  ): StageRulesV1 | undefined {
    return config?.stages.find((stage) => stage.stageKey === stageKey);
  }

  private async getRulesForSuspension(
    suspension: PlayerSuspensionEntity,
  ): Promise<SuspensionRuleV1> {
    const match = suspension.sourceMatchId
      ? await this.matchRepository.findOne({
          where: { id: suspension.sourceMatchId },
        })
      : undefined;
    const context = await this.loadContext(
      match ??
        ({
          tournamentId: suspension.tournamentId,
          stageId: suspension.stageId,
        } as MatchEntity),
    );
    if (suspension.reason === PlayerSuspensionReason.DIRECT_RED) {
      const rule = context.currentRules.directRed;
      if (!rule.enabled) {
        throw new BadRequestException('Direct-red suspensions are disabled');
      }
      return rule;
    }
    if (suspension.reason === PlayerSuspensionReason.SECOND_YELLOW_CARD) {
      const rule = context.currentRules.secondYellowInMatch;
      if (!rule.enabled) {
        throw new BadRequestException('Second-yellow suspensions are disabled');
      }
      return rule;
    }
    return {
      enabled: true,
      minimumMatches: suspension.matchesRequired,
      allowManualExtension: true,
    };
  }

  private isCardEvent(eventType: MatchEventType): boolean {
    return [
      MatchEventType.YELLOW_CARD,
      MatchEventType.SECOND_YELLOW_CARD,
      MatchEventType.RED_CARD,
    ].includes(eventType);
  }

  private cancelSuspensions(suspensions: PlayerSuspensionEntity[]): void {
    const now = new Date();
    for (const suspension of suspensions) {
      suspension.status = PlayerSuspensionStatus.CANCELLED;
      suspension.cancelledAt = now;
    }
  }
}
