import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';

import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { QualificationSnapshotEntity } from '../tournament-qualifications/entities/qualification-snapshot.entity';
import { QualificationSnapshotEntryEntity } from '../tournament-qualifications/entities/qualification-snapshot-entry.entity';
import { QualificationSnapshotStatus } from '../tournament-qualifications/enums/qualification-snapshot-status.enum';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import type {
  BracketRuleV1,
  KnockoutParticipantSourceV1,
} from '../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../tournament-stages/enums/tournament-stage-type.enum';
import type { ConfirmKnockoutBracketDto } from '../tournaments/dto/confirm-knockout-bracket.dto';
import type { PreviewKnockoutBracketDto } from '../tournaments/dto/preview-knockout-bracket.dto';
import { KnockoutBracketPlanEntity } from './entities/knockout-bracket-plan.entity';
import { KnockoutBracketSnapshotEntity } from './entities/knockout-bracket-snapshot.entity';
import { KnockoutBracketSnapshotStatus } from './enums/knockout-bracket-snapshot-status.enum';
import { KnockoutBracketEngine } from './knockout-bracket.engine';
import type {
  KnockoutQualifierInput,
  KnockoutSeedingInput,
} from './types/knockout-bracket.type';
import { VenueEntity } from '../venues/entities/venue.entity';

interface BracketSourceContext {
  stage: TournamentStageEntity;
  qualificationSnapshot: QualificationSnapshotEntity;
  ruleVersion: TournamentRuleVersionEntity;
  bracket: BracketRuleV1;
  qualifiers: KnockoutQualifierInput[];
}

@Injectable()
export class KnockoutBracketService {
  constructor(
    @InjectRepository(KnockoutBracketSnapshotEntity)
    private readonly snapshotRepository: Repository<KnockoutBracketSnapshotEntity>,
    private readonly dataSource: DataSource,
    private readonly engine: KnockoutBracketEngine,
  ) {}

  async preview(
    tournamentId: number,
    stageId: number,
    dto: PreviewKnockoutBracketDto,
    userId: number,
  ): Promise<KnockoutBracketSnapshotEntity> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const context = await this.loadSourceContext(
        manager,
        tournamentId,
        stageId,
      );
      const seedingInput = this.normalizeSeedingInput(dto);
      const generated = this.engine.generate({
        bracket: context.bracket,
        qualificationSnapshotId: context.qualificationSnapshot.id,
        qualifiers: context.qualifiers,
        seedingInput,
      });
      const snapshots = manager.getRepository(KnockoutBracketSnapshotEntity);
      const plans = manager.getRepository(KnockoutBracketPlanEntity);
      const latest = await snapshots.findOne({
        where: { tournamentId, stageId },
        order: { revision: 'DESC' },
      });
      const sourceHash = this.sourceHash(context, seedingInput);
      const snapshot = await snapshots.save(
        snapshots.create({
          tournamentId,
          stageId,
          qualificationSnapshotId: context.qualificationSnapshot.id,
          ruleVersionId: context.ruleVersion.id,
          revision: (latest?.revision ?? 0) + 1,
          status: KnockoutBracketSnapshotStatus.PREVIEW,
          isCurrent: false,
          sourceHash,
          bracketConfig: context.bracket,
          seedingInput,
          createdByUserId: userId,
        }),
      );
      snapshot.plans = await plans.save(
        generated.map((plan) =>
          plans.create({ ...plan, snapshotId: snapshot.id }),
        ),
      );
      return snapshot;
    });
  }

  async confirm(
    tournamentId: number,
    snapshotId: number,
    dto: ConfirmKnockoutBracketDto,
    userId: number,
  ): Promise<KnockoutBracketSnapshotEntity> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const snapshots = manager.getRepository(KnockoutBracketSnapshotEntity);
      const plans = manager.getRepository(KnockoutBracketPlanEntity);
      const matches = manager.getRepository(MatchEntity);
      const snapshot = await snapshots.findOne({
        where: { id: snapshotId, tournamentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!snapshot)
        throw new NotFoundException('Knockout bracket preview not found');
      snapshot.plans = await plans.find({
        where: { snapshotId: snapshot.id },
        order: { order: 'ASC' },
      });
      if (snapshot.status === KnockoutBracketSnapshotStatus.CONFIRMED) {
        snapshot.plans.sort((left, right) => left.order - right.order);
        return snapshot;
      }

      const context = await this.loadSourceContext(
        manager,
        tournamentId,
        snapshot.stageId,
      );
      if (
        context.qualificationSnapshot.id !== snapshot.qualificationSnapshotId ||
        this.sourceHash(context, snapshot.seedingInput) !== snapshot.sourceHash
      ) {
        throw new ConflictException({
          code: 'KNOCKOUT_BRACKET_PREVIEW_STALE',
          message:
            'Confirmed qualification or seeding source changed after bracket preview',
        });
      }

      const current = await snapshots.findOne({
        where: {
          tournamentId,
          stageId: snapshot.stageId,
          status: KnockoutBracketSnapshotStatus.CONFIRMED,
          isCurrent: true,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (current && current.id !== snapshot.id && !dto.replaceCurrent) {
        throw new ConflictException(
          'A confirmed bracket already exists; explicitly request replacement',
        );
      }

      const existingMatches = await matches.find({
        where: {
          stageId: snapshot.stageId,
          status: Not(MatchStatus.CANCELLED),
        },
        order: { id: 'ASC' },
      });
      const sameSnapshotMatches = existingMatches.filter(
        (match) => match.bracketSnapshotId === snapshot.id,
      );
      if (sameSnapshotMatches.length === snapshot.plans.length) {
        snapshot.status = KnockoutBracketSnapshotStatus.CONFIRMED;
        snapshot.isCurrent = true;
        snapshot.confirmedAt ??= new Date();
        snapshot.confirmedByUserId ??= userId;
        return snapshots.save(snapshot);
      }
      if (
        existingMatches.some(
          (match) =>
            match.status === MatchStatus.LIVE ||
            match.status === MatchStatus.FINISHED,
        )
      ) {
        throw new ConflictException(
          'An active or completed knockout bracket cannot be replaced',
        );
      }
      if (existingMatches.length > 0) {
        if (!dto.replaceCurrent) {
          throw new ConflictException(
            'Reset or explicitly replace the existing knockout schedule',
          );
        }
        await matches.delete(existingMatches.map((match) => match.id));
      }
      if (current && current.id !== snapshot.id) {
        current.isCurrent = false;
        await snapshots.save(current);
      }

      const orderedPlans = [...snapshot.plans].sort(
        (left, right) => left.order - right.order,
      );
      const scheduleByPosition = await this.validateSchedule(
        manager,
        orderedPlans.map((plan) => plan.bracketPosition),
        dto.schedule,
      );
      for (const plan of orderedPlans) {
        const schedule = scheduleByPosition.get(plan.bracketPosition);
        const match = await matches.save(
          matches.create({
            tournamentId,
            stageId: snapshot.stageId,
            effectiveRuleVersionId: snapshot.ruleVersionId,
            bracketSnapshotId: snapshot.id,
            bracketPosition: plan.bracketPosition,
            roundType: plan.roundType,
            roundNumber: plan.roundNumber,
            round: this.roundLabel(plan.roundType, plan.bracketPosition),
            homeTeamId: this.resolvedTeamId(plan.homeSource),
            awayTeamId: this.resolvedTeamId(plan.awaySource),
            homeParticipantSource: plan.homeSource,
            awayParticipantSource: plan.awaySource,
            matchDatetime: schedule
              ? new Date(schedule.matchDatetime)
              : undefined,
            venueId: schedule?.venueId,
            status: MatchStatus.SCHEDULED,
          }),
        );
        plan.matchId = match.id;
        await plans.save(plan);
      }
      snapshot.status = KnockoutBracketSnapshotStatus.CONFIRMED;
      snapshot.isCurrent = true;
      snapshot.confirmedAt = new Date();
      snapshot.confirmedByUserId = userId;
      snapshot.plans = orderedPlans;
      return snapshots.save(snapshot);
    });
  }

  private async validateSchedule(
    manager: EntityManager,
    bracketPositions: string[],
    schedule: ConfirmKnockoutBracketDto['schedule'],
  ): Promise<
    Map<string, NonNullable<ConfirmKnockoutBracketDto['schedule']>[number]>
  > {
    const byPosition = new Map<
      string,
      NonNullable<ConfirmKnockoutBracketDto['schedule']>[number]
    >();
    if (!schedule) return byPosition;

    schedule.forEach((item) => {
      if (byPosition.has(item.bracketPosition)) {
        throw new BadRequestException(
          `Duplicate schedule for ${item.bracketPosition}`,
        );
      }
      byPosition.set(item.bracketPosition, item);
    });
    if (
      byPosition.size !== bracketPositions.length ||
      bracketPositions.some((position) => !byPosition.has(position)) ||
      [...byPosition.keys()].some(
        (position) => !bracketPositions.includes(position),
      )
    ) {
      throw new BadRequestException(
        'A date, time and venue are required for every knockout match',
      );
    }

    const venueIds = [...new Set(schedule.map((item) => item.venueId))];
    const venueCount = await manager.getRepository(VenueEntity).countBy({
      id: In(venueIds),
      isActive: true,
    });
    if (venueCount !== venueIds.length) {
      throw new BadRequestException('Schedule contains an unavailable venue');
    }
    return byPosition;
  }

  async getCurrent(
    tournamentId: number,
    stageId: number,
  ): Promise<KnockoutBracketSnapshotEntity> {
    const snapshot = await this.snapshotRepository.findOne({
      where: {
        tournamentId,
        stageId,
        status: KnockoutBracketSnapshotStatus.CONFIRMED,
        isCurrent: true,
      },
      relations: { plans: { match: true }, qualificationSnapshot: true },
    });
    if (!snapshot)
      throw new NotFoundException('Confirmed knockout bracket not found');
    snapshot.plans.sort((left, right) => left.order - right.order);
    return snapshot;
  }

  async advanceAutomatically(
    tournamentId: number,
    matchId: number,
  ): Promise<MatchEntity | undefined> {
    return this.advanceInternal(tournamentId, matchId, undefined, true);
  }

  async advance(
    tournamentId: number,
    matchId: number,
    winnerTeamId?: number,
  ): Promise<MatchEntity> {
    const result = await this.advanceInternal(
      tournamentId,
      matchId,
      winnerTeamId,
      false,
    );
    if (!result) throw new ConflictException('Knockout winner is unresolved');
    return result;
  }

  private async advanceInternal(
    tournamentId: number,
    matchId: number,
    suppliedWinnerTeamId: number | undefined,
    allowUnresolvedDraw: boolean,
  ): Promise<MatchEntity | undefined> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const matches = manager.getRepository(MatchEntity);
      const match = await matches.findOne({
        where: { id: matchId, tournamentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!match) throw new NotFoundException('Knockout match not found');
      if (!match.bracketSnapshotId) return match;
      if (match.status !== MatchStatus.FINISHED) {
        throw new ConflictException('Only a finished match can advance teams');
      }
      if (!match.resultOfficialAt) {
        if (allowUnresolvedDraw) return undefined;
        throw new ConflictException(
          'Only a match with an official result can advance teams',
        );
      }
      if (!match.homeTeamId || !match.awayTeamId) {
        throw new ConflictException(
          'Knockout match participants are unresolved',
        );
      }
      const winnerTeamId = suppliedWinnerTeamId ?? match.winnerTeamId;
      if (!winnerTeamId) {
        if (allowUnresolvedDraw) return undefined;
        throw new ConflictException(
          'A tied knockout match requires a saved winner after penalties',
        );
      }
      if (![match.homeTeamId, match.awayTeamId].includes(winnerTeamId)) {
        throw new ConflictException(
          'Winner must be a participant of the match',
        );
      }
      const loserTeamId =
        winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
      match.winnerTeamId = winnerTeamId;
      match.loserTeamId = loserTeamId;
      await matches.save(match);

      const downstream = await matches.find({
        where: { bracketSnapshotId: match.bracketSnapshotId },
        order: { roundNumber: 'ASC', id: 'ASC' },
      });
      for (const candidate of downstream) {
        let changed = false;
        const homeResolved = this.outcomeTeam(
          candidate.homeParticipantSource,
          match.bracketPosition,
          winnerTeamId,
          loserTeamId,
        );
        const awayResolved = this.outcomeTeam(
          candidate.awayParticipantSource,
          match.bracketPosition,
          winnerTeamId,
          loserTeamId,
        );
        if (homeResolved !== undefined) {
          this.assertMutableParticipant(
            candidate,
            candidate.homeTeamId,
            homeResolved,
          );
          candidate.homeTeamId = homeResolved;
          changed = true;
        }
        if (awayResolved !== undefined) {
          this.assertMutableParticipant(
            candidate,
            candidate.awayTeamId,
            awayResolved,
          );
          candidate.awayTeamId = awayResolved;
          changed = true;
        }
        if (
          changed &&
          candidate.homeTeamId &&
          candidate.homeTeamId === candidate.awayTeamId
        ) {
          throw new ConflictException(
            'A knockout match cannot contain one team twice',
          );
        }
        if (changed) await matches.save(candidate);
      }
      return match;
    });
  }

  private async loadSourceContext(
    manager: EntityManager,
    tournamentId: number,
    stageId: number,
  ): Promise<BracketSourceContext> {
    const stages = manager.getRepository(TournamentStageEntity);
    const qualificationSnapshots = manager.getRepository(
      QualificationSnapshotEntity,
    );
    const qualificationEntries = manager.getRepository(
      QualificationSnapshotEntryEntity,
    );
    const versions = manager.getRepository(TournamentRuleVersionEntity);
    const stage = await stages.findOne({
      where: { id: stageId, tournamentId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!stage) throw new NotFoundException('Knockout stage not found');
    if (stage.type !== TournamentStageType.KNOCKOUT) {
      throw new ConflictException(
        'Bracket can be created only for a knockout stage',
      );
    }
    const qualificationSnapshot = await qualificationSnapshots.findOne({
      where: {
        tournamentId,
        toStageId: stageId,
        status: QualificationSnapshotStatus.CONFIRMED,
        isCurrent: true,
      },
      lock: { mode: 'pessimistic_read' },
    });
    if (!qualificationSnapshot) {
      throw new ConflictException(
        'Confirm qualification before previewing the knockout bracket',
      );
    }
    qualificationSnapshot.entries = await qualificationEntries.find({
      where: { snapshotId: qualificationSnapshot.id },
      relations: { tournamentTeam: true },
      order: { selectionOrder: 'ASC' },
    });
    const ruleVersion = await versions.findOne({
      where: { id: qualificationSnapshot.ruleVersionId, tournamentId },
    });
    if (!ruleVersion)
      throw new NotFoundException('Bracket rule version not found');
    const stageRules = ruleVersion.config.stages.find(
      (candidate) => candidate.stageKey === stage.key,
    );
    if (!stageRules || stageRules.type !== 'knockout') {
      throw new ConflictException(
        'Rule version has no compatible knockout stage',
      );
    }
    const qualifiers = [...qualificationSnapshot.entries]
      .sort((left, right) => left.selectionOrder - right.selectionOrder)
      .map((entry) => ({
        qualificationEntryId: entry.id,
        qualificationSnapshotId: qualificationSnapshot.id,
        tournamentTeamId: entry.tournamentTeamId,
        teamId: entry.tournamentTeam.teamId,
        selectionOrder: entry.selectionOrder,
        qualificationRuleId: entry.qualificationRuleId,
        sourceGroupId: entry.sourceGroupId,
        comparisonSnapshot: entry.comparisonSnapshot,
      }));
    return {
      stage,
      qualificationSnapshot,
      ruleVersion,
      bracket: stageRules.bracket,
      qualifiers,
    };
  }

  private normalizeSeedingInput(
    dto: PreviewKnockoutBracketDto,
  ): KnockoutSeedingInput {
    return {
      randomSeed: dto.randomSeed,
      manualPairs: (dto.manualPairs ?? []).map((pair) => ({ ...pair })),
      drawResults: (dto.drawResults ?? []).map((draw) => ({ ...draw })),
    };
  }

  private sourceHash(
    context: BracketSourceContext,
    seedingInput: KnockoutSeedingInput,
  ): string {
    return createHash('sha256')
      .update(
        this.stableSerialize({
          qualificationSnapshotId: context.qualificationSnapshot.id,
          qualificationSourceHash: context.qualificationSnapshot.sourceHash,
          ruleVersionId: context.ruleVersion.id,
          bracket: context.bracket,
          qualifiers: context.qualifiers,
          seedingInput,
        }),
      )
      .digest('hex');
  }

  private stableSerialize(value: unknown): string {
    return JSON.stringify(this.sortJsonKeys(value));
  }

  private sortJsonKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortJsonKeys(item));
    }
    if (value === null || typeof value !== 'object') return value;

    const record = value as Record<string, unknown>;
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = record[key];
        if (item !== undefined) result[key] = this.sortJsonKeys(item);
        return result;
      }, {});
  }

  private resolvedTeamId(
    source: KnockoutParticipantSourceV1,
  ): number | undefined {
    return source.type === 'match_outcome' ? undefined : source.teamId;
  }

  private outcomeTeam(
    source: KnockoutParticipantSourceV1 | undefined,
    sourceBracketPosition: string | undefined,
    winnerTeamId: number,
    loserTeamId: number,
  ): number | undefined {
    if (
      source?.type !== 'match_outcome' ||
      source.bracketPosition !== sourceBracketPosition
    ) {
      return undefined;
    }
    return source.outcome === 'winner' ? winnerTeamId : loserTeamId;
  }

  private assertMutableParticipant(
    match: MatchEntity,
    currentTeamId: number | undefined,
    nextTeamId: number,
  ): void {
    if (
      currentTeamId !== undefined &&
      currentTeamId !== nextTeamId &&
      match.status !== MatchStatus.SCHEDULED
    ) {
      throw new ConflictException(
        'Cannot change a participant of an active or completed downstream match',
      );
    }
  }

  private roundLabel(roundType: string, bracketPosition: string): string {
    return `${roundType}:${bracketPosition}`;
  }
}
