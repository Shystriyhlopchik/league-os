import { createHash } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';

import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { StandingEntity } from '../standings/entities/standing.entity';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentRuleVersionStatus } from '../tournament-rules/enums/tournament-rule-version-status.enum';
import type { StageTransitionRuleV1 } from '../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageParticipantStatus } from '../tournament-stage-participants/enums/tournament-stage-participant-status.enum';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageStatus } from '../tournament-stages/enums/tournament-stage-status.enum';
import type { ConfirmQualificationDto } from '../tournaments/dto/confirm-qualification.dto';
import type { PreviewQualificationDto } from '../tournaments/dto/preview-qualification.dto';
import type { RecalculateQualificationDto } from '../tournaments/dto/recalculate-qualification.dto';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { QualificationSnapshotEntity } from './entities/qualification-snapshot.entity';
import { QualificationSnapshotEntryEntity } from './entities/qualification-snapshot-entry.entity';
import { QualificationSnapshotStatus } from './enums/qualification-snapshot-status.enum';
import { QualificationEngine } from './qualification.engine';
import type {
  QualificationResolutionInput,
  QualificationSelection,
  QualificationStandingInput,
} from './types/qualification-engine.type';

interface QualificationContext {
  fromStage: TournamentStageEntity;
  toStage: TournamentStageEntity;
  ruleVersion: TournamentRuleVersionEntity;
  transition: StageTransitionRuleV1;
  standings: QualificationStandingInput[];
  sourceHash: string;
}

export interface QualificationDiff {
  addedTournamentTeamIds: number[];
  removedTournamentTeamIds: number[];
  unchangedTournamentTeamIds: number[];
  moved: Array<{
    tournamentTeamId: number;
    previousOrder: number;
    nextOrder: number;
  }>;
}

@Injectable()
export class QualificationService {
  constructor(
    @InjectRepository(QualificationSnapshotEntity)
    private readonly snapshotRepository: Repository<QualificationSnapshotEntity>,
    private readonly dataSource: DataSource,
    private readonly engine: QualificationEngine,
  ) {}

  async preview(
    tournamentId: number,
    fromStageId: number,
    toStageId: number,
    dto: PreviewQualificationDto,
    userId: number,
  ): Promise<QualificationSnapshotEntity> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const context = await this.loadContext(
        manager,
        tournamentId,
        fromStageId,
        toStageId,
        dto.ruleVersionId,
      );
      const resolutions = this.normalizeResolutions(dto);
      const selections = this.engine.calculate({
        rules: context.transition.qualification,
        standings: context.standings,
        resolutions,
      });
      const snapshots = manager.getRepository(QualificationSnapshotEntity);
      const entries = manager.getRepository(QualificationSnapshotEntryEntity);
      const latest = await snapshots.findOne({
        where: { tournamentId, fromStageId, toStageId },
        order: { revision: 'DESC' },
      });
      const snapshot = await snapshots.save(
        snapshots.create({
          tournamentId,
          fromStageId,
          toStageId,
          ruleVersionId: context.ruleVersion.id,
          revision: (latest?.revision ?? 0) + 1,
          status: QualificationSnapshotStatus.PREVIEW,
          isCurrent: false,
          sourceHash: context.sourceHash,
          transitionConfig: context.transition,
          resolutionInput: resolutions,
          createdByUserId: userId,
        }),
      );
      snapshot.entries = await entries.save(
        selections.map((selection) =>
          this.createEntry(entries, snapshot.id, selection),
        ),
      );
      return snapshot;
    });
  }

  async confirm(
    tournamentId: number,
    snapshotId: number,
    dto: ConfirmQualificationDto,
    userId: number,
  ): Promise<QualificationSnapshotEntity> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const snapshots = manager.getRepository(QualificationSnapshotEntity);
      const participants = manager.getRepository(
        TournamentStageParticipantEntity,
      );
      const matches = manager.getRepository(MatchEntity);
      const snapshot = await snapshots.findOne({
        where: { id: snapshotId, tournamentId },
        relations: { entries: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!snapshot)
        throw new NotFoundException('Qualification preview not found');
      if (snapshot.status !== QualificationSnapshotStatus.PREVIEW) {
        throw new ConflictException(
          'Only a qualification preview can be confirmed',
        );
      }

      const context = await this.loadContext(
        manager,
        tournamentId,
        snapshot.fromStageId,
        snapshot.toStageId,
        snapshot.ruleVersionId,
      );
      if (context.sourceHash !== snapshot.sourceHash) {
        throw new ConflictException({
          code: 'QUALIFICATION_PREVIEW_STALE',
          message:
            'Source standings changed after preview; recalculate qualification before confirmation',
        });
      }
      if (context.toStage.status !== TournamentStageStatus.PENDING) {
        throw new ConflictException(
          'Qualification cannot change an active or completed target stage',
        );
      }
      if (
        await matches.exists({
          where: {
            stageId: snapshot.toStageId,
            status: Not(MatchStatus.CANCELLED),
          },
        })
      ) {
        throw new ConflictException(
          'Reset the target-stage schedule before confirming qualification',
        );
      }

      const current = await snapshots.findOne({
        where: {
          tournamentId,
          fromStageId: snapshot.fromStageId,
          toStageId: snapshot.toStageId,
          status: QualificationSnapshotStatus.CONFIRMED,
          isCurrent: true,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (current && !dto.replaceCurrent) {
        throw new ConflictException(
          'A confirmed snapshot already exists; explicitly request replacement',
        );
      }

      const existingParticipants = await participants.find({
        where: { stageId: snapshot.toStageId },
      });
      if (
        existingParticipants.some(
          (participant) =>
            !participant.qualificationSource?.startsWith(
              'qualification_snapshot:',
            ),
        )
      ) {
        throw new ConflictException(
          'Target stage contains participants not managed by qualification snapshots',
        );
      }

      if (current) {
        current.isCurrent = false;
        await snapshots.save(current);
      }
      if (existingParticipants.length > 0) {
        await participants.delete({
          id: In(existingParticipants.map((participant) => participant.id)),
        });
      }
      await participants.save(
        [...snapshot.entries]
          .sort((left, right) => left.selectionOrder - right.selectionOrder)
          .map((entry) =>
            participants.create({
              stageId: snapshot.toStageId,
              tournamentTeamId: entry.tournamentTeamId,
              seedNumber: entry.selectionOrder,
              qualificationSource: `qualification_snapshot:${snapshot.id}:${entry.qualificationRuleId}`,
              status: TournamentStageParticipantStatus.ACTIVE,
            }),
          ),
      );

      snapshot.status = QualificationSnapshotStatus.CONFIRMED;
      snapshot.isCurrent = true;
      snapshot.confirmedAt = new Date();
      snapshot.confirmedByUserId = userId;
      snapshot.supersedesSnapshotId = current?.id;
      return snapshots.save(snapshot);
    });
  }

  async recalculate(
    tournamentId: number,
    snapshotId: number,
    dto: RecalculateQualificationDto,
    userId: number,
  ): Promise<{
    confirmed: QualificationSnapshotEntity;
    preview: QualificationSnapshotEntity;
    diff: QualificationDiff;
  }> {
    const confirmed = await this.snapshotRepository.findOne({
      where: { id: snapshotId, tournamentId },
      relations: { entries: true },
    });
    if (!confirmed)
      throw new NotFoundException('Qualification snapshot not found');
    if (confirmed.status !== QualificationSnapshotStatus.CONFIRMED) {
      throw new ConflictException(
        'Only a confirmed snapshot can be explicitly recalculated',
      );
    }
    const preview = await this.preview(
      tournamentId,
      confirmed.fromStageId,
      confirmed.toStageId,
      {
        ruleVersionId: confirmed.ruleVersionId,
        manualSelections:
          dto.manualSelections ?? confirmed.resolutionInput.manualSelections,
        drawResults: dto.drawResults ?? confirmed.resolutionInput.drawResults,
      },
      userId,
    );
    return {
      confirmed,
      preview,
      diff: this.calculateDiff(confirmed.entries, preview.entries),
    };
  }

  async getCurrent(
    tournamentId: number,
    fromStageId: number,
    toStageId: number,
  ): Promise<QualificationSnapshotEntity> {
    const snapshot = await this.snapshotRepository.findOne({
      where: {
        tournamentId,
        fromStageId,
        toStageId,
        status: QualificationSnapshotStatus.CONFIRMED,
        isCurrent: true,
      },
      relations: {
        entries: { tournamentTeam: { team: true }, sourceGroup: true },
      },
      order: { revision: 'DESC' },
    });
    if (!snapshot) {
      throw new NotFoundException('Confirmed qualification snapshot not found');
    }
    snapshot.entries.sort(
      (left, right) => left.selectionOrder - right.selectionOrder,
    );
    return snapshot;
  }

  calculateDiff(
    previous: QualificationSnapshotEntryEntity[],
    next: QualificationSnapshotEntryEntity[],
  ): QualificationDiff {
    const previousByTeam = new Map(
      previous.map((entry) => [entry.tournamentTeamId, entry.selectionOrder]),
    );
    const nextByTeam = new Map(
      next.map((entry) => [entry.tournamentTeamId, entry.selectionOrder]),
    );
    const addedTournamentTeamIds = [...nextByTeam.keys()]
      .filter((id) => !previousByTeam.has(id))
      .sort((a, b) => a - b);
    const removedTournamentTeamIds = [...previousByTeam.keys()]
      .filter((id) => !nextByTeam.has(id))
      .sort((a, b) => a - b);
    const unchangedTournamentTeamIds = [...nextByTeam.keys()]
      .filter((id) => previousByTeam.has(id))
      .sort((a, b) => a - b);
    const moved = unchangedTournamentTeamIds
      .filter((id) => previousByTeam.get(id) !== nextByTeam.get(id))
      .map((tournamentTeamId) => ({
        tournamentTeamId,
        previousOrder: previousByTeam.get(tournamentTeamId) as number,
        nextOrder: nextByTeam.get(tournamentTeamId) as number,
      }));
    return {
      addedTournamentTeamIds,
      removedTournamentTeamIds,
      unchangedTournamentTeamIds,
      moved,
    };
  }

  private async loadContext(
    manager: EntityManager,
    tournamentId: number,
    fromStageId: number,
    toStageId: number,
    requestedRuleVersionId?: number,
  ): Promise<QualificationContext> {
    const tournaments = manager.getRepository(TournamentEntity);
    const stages = manager.getRepository(TournamentStageEntity);
    const versions = manager.getRepository(TournamentRuleVersionEntity);
    const standingsRepository = manager.getRepository(StandingEntity);
    const groups = manager.getRepository(TournamentGroupEntity);
    const participants = manager.getRepository(
      TournamentStageParticipantEntity,
    );

    const tournament = await tournaments.findOne({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    const [fromStage, toStage] = await stages.find({
      where: { id: In([fromStageId, toStageId]), tournamentId },
      order: { order: 'ASC' },
      lock: { mode: 'pessimistic_read' },
    });
    const stageById = new Map(
      [fromStage, toStage]
        .filter((stage): stage is TournamentStageEntity => Boolean(stage))
        .map((stage) => [stage.id, stage]),
    );
    const actualFromStage = stageById.get(fromStageId);
    const actualToStage = stageById.get(toStageId);
    if (!actualFromStage || !actualToStage) {
      throw new NotFoundException('Tournament transition stages not found');
    }
    const ruleVersionId =
      requestedRuleVersionId ?? tournament.activeRuleVersionId;
    if (!ruleVersionId) {
      throw new ConflictException('Tournament has no active rule version');
    }
    const ruleVersion = await versions.findOne({
      where: { id: ruleVersionId, tournamentId },
    });
    if (!ruleVersion) throw new NotFoundException('Rule version not found');
    if (ruleVersion.status === TournamentRuleVersionStatus.DRAFT) {
      throw new ConflictException(
        'Qualification requires a published or superseded rule version',
      );
    }
    const transition = ruleVersion.config.transitions.find(
      (candidate) =>
        candidate.fromStageKey === actualFromStage.key &&
        candidate.toStageKey === actualToStage.key,
    );
    if (!transition) {
      throw new ConflictException(
        'Rule version has no transition between the requested stages',
      );
    }

    const [standingRows, groupRows, participantRows] = await Promise.all([
      standingsRepository.find({
        where: { tournamentId, stageId: fromStageId },
        order: { groupId: 'ASC', position: 'ASC', teamId: 'ASC' },
      }),
      groups.find({
        where: { stageId: fromStageId },
        order: { order: 'ASC' },
      }),
      participants.find({
        where: { stageId: fromStageId },
        relations: { tournamentTeam: true },
      }),
    ]);
    if (
      standingRows.length === 0 ||
      standingRows.length !== participantRows.length
    ) {
      throw new ConflictException(
        'Recalculate every source-stage standings table before qualification',
      );
    }
    if (
      standingRows.some((standing) => standing.ruleVersionId !== ruleVersion.id)
    ) {
      throw new ConflictException(
        'Source standings were calculated with another rule version',
      );
    }
    const groupOrder = new Map(
      groupRows.map((group) => [group.id, group.order]),
    );
    const participantByTeam = new Map(
      participantRows.map((participant) => [
        participant.tournamentTeam.teamId,
        participant,
      ]),
    );
    const standings = standingRows.map((standing) => {
      const participant = participantByTeam.get(standing.teamId);
      if (
        !participant ||
        participant.groupId !== standing.groupId ||
        standing.position === undefined
      ) {
        throw new ConflictException(
          'Source standings do not match current stage participants and groups',
        );
      }
      return {
        tournamentTeamId: participant.tournamentTeamId,
        teamId: standing.teamId,
        groupId: standing.groupId,
        groupOrder: standing.groupId
          ? (groupOrder.get(standing.groupId) ?? 0)
          : 0,
        position: standing.position,
        points: standing.points,
        wins: standing.wins,
        goalDifference: standing.goalDifference,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        disciplinaryScore: standing.disciplinaryScore,
      } satisfies QualificationStandingInput;
    });
    return {
      fromStage: actualFromStage,
      toStage: actualToStage,
      ruleVersion,
      transition,
      standings,
      sourceHash: this.sourceHash(ruleVersion.id, transition, standings),
    };
  }

  private sourceHash(
    ruleVersionId: number,
    transition: StageTransitionRuleV1,
    standings: QualificationStandingInput[],
  ): string {
    const stableStandings = [...standings].sort(
      (left, right) =>
        left.groupOrder - right.groupOrder ||
        left.position - right.position ||
        left.tournamentTeamId - right.tournamentTeamId,
    );
    return createHash('sha256')
      .update(JSON.stringify({ ruleVersionId, transition, stableStandings }))
      .digest('hex');
  }

  private normalizeResolutions(
    dto: Pick<PreviewQualificationDto, 'manualSelections' | 'drawResults'>,
  ): QualificationResolutionInput {
    return {
      manualSelections: (dto.manualSelections ?? []).map((selection) => ({
        qualificationRuleId: selection.qualificationRuleId,
        tournamentTeamIds: [...selection.tournamentTeamIds],
      })),
      drawResults: (dto.drawResults ?? []).map((draw) => ({ ...draw })),
    };
  }

  private createEntry(
    repository: Repository<QualificationSnapshotEntryEntity>,
    snapshotId: number,
    selection: QualificationSelection,
  ): QualificationSnapshotEntryEntity {
    return repository.create({
      snapshotId,
      tournamentTeamId: selection.tournamentTeamId,
      sourceGroupId: selection.sourceGroupId,
      sourcePosition: selection.sourcePosition,
      qualificationRuleId: selection.qualificationRuleId,
      selectionOrder: selection.selectionOrder,
      comparisonSnapshot: selection.comparisonSnapshot,
      selectionReason: selection.reason,
    });
  }
}
