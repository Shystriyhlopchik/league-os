import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';

import { MatchEntity } from '../matches/entities/match.entity';
import { PlayerSuspensionsService } from '../player-suspensions/player-suspensions.service';
import { QualificationSnapshotEntity } from '../tournament-qualifications/entities/qualification-snapshot.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { CancelTournamentDecisionDto } from './dto/cancel-tournament-decision.dto';
import { CreateTournamentDecisionDto } from './dto/create-tournament-decision.dto';
import { TournamentDecisionEntity } from './entities/tournament-decision.entity';
import { TournamentDecisionEntityType } from './enums/tournament-decision-entity-type.enum';
import { TournamentDecisionStatus } from './enums/tournament-decision-status.enum';
import { TournamentDecisionType } from './enums/tournament-decision-type.enum';
import type {
  PointsDeductionDecisionValues,
  QualificationOverrideDecisionValues,
  RankingDecisionValues,
  ResultAnnulmentDecisionValues,
  SuspensionCancellationDecisionValues,
  SuspensionExtensionDecisionValues,
  TechnicalResultDecisionValues,
  TournamentDecisionValues,
} from './types/tournament-decision.type';

@Injectable()
export class TournamentDecisionsService {
  constructor(
    @InjectRepository(TournamentDecisionEntity)
    private readonly decisionRepository: Repository<TournamentDecisionEntity>,
    private readonly dataSource: DataSource,
    private readonly playerSuspensionsService: PlayerSuspensionsService,
  ) {}

  async create(
    tournamentId: number,
    dto: CreateTournamentDecisionDto,
    authorUserId: number,
  ): Promise<TournamentDecisionEntity> {
    const effectiveAt = dto.effectiveAt ? new Date(dto.effectiveAt) : new Date();
    this.assertNoExecutableValues(dto.valuesAfter);
    if (
      effectiveAt.getTime() > Date.now() &&
      (dto.type === TournamentDecisionType.SUSPENSION_EXTENSION ||
        dto.type === TournamentDecisionType.SUSPENSION_CANCELLATION)
    ) {
      throw new BadRequestException(
        'Future effective time is not supported for suspension decisions',
      );
    }

    const prepared = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const valuesAfter = await this.validateAndNormalize(
          manager,
          tournamentId,
          dto.type,
          dto.valuesAfter,
        );
        const valuesBefore = await this.captureBefore(
          manager,
          tournamentId,
          dto.type,
          valuesAfter,
        );
        const repository = manager.getRepository(TournamentDecisionEntity);
        return repository.save(
          repository.create({
            tournamentId,
            type: dto.type,
            status: TournamentDecisionStatus.ACTIVE,
            authorUserId,
            reason: dto.reason.trim(),
            comment: dto.comment?.trim() || undefined,
            affectedEntities: dto.affectedEntities,
            valuesBefore,
            valuesAfter,
            effectiveAt,
          }),
        );
      },
    );
    await this.applySuspensionSideEffect(prepared);
    return prepared;
  }

  async cancel(
    tournamentId: number,
    decisionId: number,
    dto: CancelTournamentDecisionDto,
    authorUserId: number,
  ): Promise<TournamentDecisionEntity> {
    const cancellation = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const repository = manager.getRepository(TournamentDecisionEntity);
        const original = await repository.findOne({
          where: {
            id: decisionId,
            tournamentId,
            status: TournamentDecisionStatus.ACTIVE,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!original) throw new NotFoundException('Tournament decision not found');
        const existingCancellation = await repository.findOne({
          where: {
            tournamentId,
            reversesDecisionId: original.id,
            status: TournamentDecisionStatus.CANCELLATION,
          },
        });
        if (existingCancellation) {
          throw new ConflictException('Tournament decision is already cancelled');
        }
        return repository.save(
          repository.create({
            tournamentId,
            type: original.type,
            status: TournamentDecisionStatus.CANCELLATION,
            authorUserId,
            reason: dto.reason.trim(),
            comment: dto.comment?.trim() || undefined,
            affectedEntities: original.affectedEntities,
            valuesBefore: original.valuesAfter,
            valuesAfter: original.valuesBefore,
            effectiveAt: new Date(),
            reversesDecisionId: original.id,
          }),
        );
      },
    );
    const original = await this.decisionRepository.findOneOrFail({
      where: { id: cancellation.reversesDecisionId },
    });
    await this.revertSuspensionSideEffect(original);
    return cancellation;
  }

  findAuditLog(tournamentId: number): Promise<TournamentDecisionEntity[]> {
    return this.decisionRepository.find({
      where: { tournamentId },
      relations: { author: true, reversesDecision: true },
      order: { effectiveAt: 'DESC', id: 'DESC' },
    });
  }

  async findEffective(
    tournamentId: number,
    type?: TournamentDecisionType,
    manager?: EntityManager,
    effectiveAt = new Date(),
  ): Promise<TournamentDecisionEntity[]> {
    const repository = (manager ?? this.dataSource.manager).getRepository(
      TournamentDecisionEntity,
    );
    const rows = await repository.find({
      where: {
        tournamentId,
        ...(type ? { type } : {}),
        effectiveAt: LessThanOrEqual(effectiveAt),
      },
      order: { effectiveAt: 'ASC', id: 'ASC' },
    });
    const reversedIds = new Set(
      rows
        .filter(
          (row) =>
            row.status === TournamentDecisionStatus.CANCELLATION &&
            row.reversesDecisionId,
        )
        .map((row) => row.reversesDecisionId as number),
    );
    return rows.filter(
      (row) =>
        row.status === TournamentDecisionStatus.ACTIVE &&
        !reversedIds.has(row.id),
    );
  }

  private async validateAndNormalize(
    manager: EntityManager,
    tournamentId: number,
    type: TournamentDecisionType,
    value: Record<string, unknown>,
  ): Promise<TournamentDecisionValues> {
    if (type === TournamentDecisionType.TECHNICAL_RESULT) {
      this.exactKeys(value, ['matchId', 'winnerTeamId', 'loserTeamId']);
      const result = value as unknown as TechnicalResultDecisionValues;
      this.positiveIds(result, ['matchId', 'winnerTeamId', 'loserTeamId']);
      const match = await this.requireMatch(manager, tournamentId, result.matchId);
      if (
        ![match.homeTeamId, match.awayTeamId].includes(result.winnerTeamId) ||
        ![match.homeTeamId, match.awayTeamId].includes(result.loserTeamId) ||
        result.winnerTeamId === result.loserTeamId
      ) {
        throw new BadRequestException(
          'Technical result teams must be different match participants',
        );
      }
      return result;
    }
    if (type === TournamentDecisionType.RESULT_ANNULMENT) {
      this.exactKeys(value, ['matchId']);
      const result = value as unknown as ResultAnnulmentDecisionValues;
      this.positiveIds(result, ['matchId']);
      await this.requireMatch(manager, tournamentId, result.matchId);
      return result;
    }
    if (type === TournamentDecisionType.POINTS_DEDUCTION) {
      this.exactKeys(value, ['stageId', 'groupId', 'teamId', 'points']);
      const result = value as unknown as PointsDeductionDecisionValues;
      this.positiveIds(result, ['stageId', 'teamId']);
      if (!Number.isInteger(result.points) || result.points <= 0) {
        throw new BadRequestException('points must be a positive integer');
      }
      await this.requireStage(manager, tournamentId, result.stageId);
      return result;
    }
    if (
      type === TournamentDecisionType.MANUAL_TIEBREAK ||
      type === TournamentDecisionType.DRAW_RESULT
    ) {
      this.exactKeys(value, ['stageId', 'groupId', 'ranks']);
      const result = value as unknown as RankingDecisionValues;
      this.positiveIds(result, ['stageId']);
      await this.requireStage(manager, tournamentId, result.stageId);
      if (!Array.isArray(result.ranks) || result.ranks.length < 2) {
        throw new BadRequestException('ranks must contain at least two teams');
      }
      const teamIds = new Set<number>();
      const ranks = new Set<number>();
      result.ranks.forEach((rank) => {
        if (
          !Number.isInteger(rank.teamId) ||
          rank.teamId <= 0 ||
          !Number.isInteger(rank.rank) ||
          rank.rank <= 0
        ) {
          throw new BadRequestException('Decision ranks must be positive integers');
        }
        teamIds.add(rank.teamId);
        ranks.add(rank.rank);
      });
      if (
        teamIds.size !== result.ranks.length ||
        ranks.size !== result.ranks.length
      ) {
        throw new BadRequestException('Decision teams and ranks must be unique');
      }
      return result;
    }
    if (type === TournamentDecisionType.SUSPENSION_EXTENSION) {
      this.exactKeys(value, ['suspensionId', 'extraMatches']);
      const result = value as unknown as SuspensionExtensionDecisionValues;
      this.positiveIds(result, ['suspensionId', 'extraMatches']);
      return result;
    }
    if (type === TournamentDecisionType.SUSPENSION_CANCELLATION) {
      this.exactKeys(value, ['suspensionId']);
      const result = value as unknown as SuspensionCancellationDecisionValues;
      this.positiveIds(result, ['suspensionId']);
      return result;
    }
    this.exactKeys(value, [
      'fromStageId',
      'toStageId',
      'tournamentTeamIds',
    ]);
    const result = value as unknown as QualificationOverrideDecisionValues;
    this.positiveIds(result, ['fromStageId', 'toStageId']);
    await this.requireStage(manager, tournamentId, result.fromStageId);
    await this.requireStage(manager, tournamentId, result.toStageId);
    if (
      !Array.isArray(result.tournamentTeamIds) ||
      result.tournamentTeamIds.length === 0 ||
      result.tournamentTeamIds.some(
        (id) => !Number.isInteger(id) || id <= 0,
      ) ||
      new Set(result.tournamentTeamIds).size !==
        result.tournamentTeamIds.length
    ) {
      throw new BadRequestException(
        'tournamentTeamIds must be a non-empty unique positive integer list',
      );
    }
    return result;
  }

  private async captureBefore(
    manager: EntityManager,
    tournamentId: number,
    type: TournamentDecisionType,
    valuesAfter: TournamentDecisionValues,
  ): Promise<TournamentDecisionValues> {
    if (type === TournamentDecisionType.TECHNICAL_RESULT) {
      const value = valuesAfter as TechnicalResultDecisionValues;
      const match = await this.requireMatch(manager, tournamentId, value.matchId);
      return {
        matchId: match.id,
        winnerTeamId: match.winnerTeamId ?? 0,
        loserTeamId: match.loserTeamId ?? 0,
        actualHomeScore: match.homeScore,
        actualAwayScore: match.awayScore,
      } as unknown as TournamentDecisionValues;
    }
    if (type === TournamentDecisionType.RESULT_ANNULMENT) {
      return { annulled: false } as unknown as TournamentDecisionValues;
    }
    if (type === TournamentDecisionType.POINTS_DEDUCTION) {
      return { points: 0 } as unknown as TournamentDecisionValues;
    }
    if (
      type === TournamentDecisionType.MANUAL_TIEBREAK ||
      type === TournamentDecisionType.DRAW_RESULT
    ) {
      return { ranks: [] } as unknown as TournamentDecisionValues;
    }
    if (type === TournamentDecisionType.QUALIFICATION_OVERRIDE) {
      const value = valuesAfter as QualificationOverrideDecisionValues;
      const current = await manager
        .getRepository(QualificationSnapshotEntity)
        .findOne({
          where: {
            tournamentId,
            fromStageId: value.fromStageId,
            toStageId: value.toStageId,
            isCurrent: true,
          },
          relations: { entries: true },
        });
      return {
        fromStageId: value.fromStageId,
        toStageId: value.toStageId,
        tournamentTeamIds:
          current?.entries
            ?.sort((left, right) => left.selectionOrder - right.selectionOrder)
            .map((entry) => entry.tournamentTeamId) ?? [],
      };
    }
    return {} as TournamentDecisionValues;
  }

  private async applySuspensionSideEffect(
    decision: TournamentDecisionEntity,
  ): Promise<void> {
    if (decision.effectiveAt.getTime() > Date.now()) {
      return;
    }
    if (decision.type === TournamentDecisionType.SUSPENSION_EXTENSION) {
      const value = decision.valuesAfter as SuspensionExtensionDecisionValues;
      await this.playerSuspensionsService.extend(
        decision.tournamentId,
        value.suspensionId,
        value.extraMatches,
        decision.id,
      );
    } else if (
      decision.type === TournamentDecisionType.SUSPENSION_CANCELLATION
    ) {
      const value =
        decision.valuesAfter as SuspensionCancellationDecisionValues;
      await this.playerSuspensionsService.cancelByDecision(
        decision.tournamentId,
        value.suspensionId,
        decision.id,
      );
    }
  }

  private async revertSuspensionSideEffect(
    decision: TournamentDecisionEntity,
  ): Promise<void> {
    if (decision.type === TournamentDecisionType.SUSPENSION_EXTENSION) {
      const value = decision.valuesAfter as SuspensionExtensionDecisionValues;
      await this.playerSuspensionsService.undoExtension(
        decision.tournamentId,
        value.suspensionId,
        value.extraMatches,
      );
    } else if (
      decision.type === TournamentDecisionType.SUSPENSION_CANCELLATION
    ) {
      const value =
        decision.valuesAfter as SuspensionCancellationDecisionValues;
      await this.playerSuspensionsService.restoreCancelled(
        decision.tournamentId,
        value.suspensionId,
      );
    }
  }

  private requireMatch(
    manager: EntityManager,
    tournamentId: number,
    matchId: number,
  ): Promise<MatchEntity> {
    return manager
      .getRepository(MatchEntity)
      .findOneOrFail({ where: { id: matchId, tournamentId } })
      .catch(() => {
        throw new NotFoundException('Tournament match not found');
      });
  }

  private requireStage(
    manager: EntityManager,
    tournamentId: number,
    stageId: number,
  ): Promise<TournamentStageEntity> {
    return manager
      .getRepository(TournamentStageEntity)
      .findOneOrFail({ where: { id: stageId, tournamentId } })
      .catch(() => {
        throw new NotFoundException('Tournament stage not found');
      });
  }

  private exactKeys(value: Record<string, unknown>, allowed: string[]): void {
    const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unexpected.length) {
      throw new BadRequestException(
        `Unsupported decision fields: ${unexpected.join(', ')}`,
      );
    }
  }

  private positiveIds(
    value: object,
    keys: string[],
  ): void {
    const record = value as Record<string, unknown>;
    keys.forEach((key) => {
      if (!Number.isInteger(record[key]) || Number(record[key]) <= 0) {
        throw new BadRequestException(`${key} must be a positive integer`);
      }
    });
  }

  private assertNoExecutableValues(value: unknown): void {
    const visit = (current: unknown): void => {
      if (typeof current === 'function') {
        throw new BadRequestException('Executable decision values are forbidden');
      }
      if (Array.isArray(current)) current.forEach(visit);
      else if (current && typeof current === 'object') {
        Object.entries(current).forEach(([key, nested]) => {
          if (/expression|script|code|function/i.test(key)) {
            throw new BadRequestException(
              'Executable decision fields are forbidden',
            );
          }
          visit(nested);
        });
      }
    };
    visit(value);
  }
}
