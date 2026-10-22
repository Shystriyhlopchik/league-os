import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { TournamentRuleVersionEntity } from '../../tournament-rules/entities/tournament-rule-version.entity';
import type { StageTransitionRuleV1 } from '../../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { QualificationSnapshotStatus } from '../enums/qualification-snapshot-status.enum';
import type { QualificationResolutionInput } from '../types/qualification-engine.type';
import { QualificationSnapshotEntryEntity } from './qualification-snapshot-entry.entity';

@Entity('tournament_qualification_snapshots')
@Unique('UQ_qualification_snapshot_transition_revision', [
  'tournamentId',
  'fromStageId',
  'toStageId',
  'revision',
])
@Index('IDX_qualification_snapshot_transition', [
  'tournamentId',
  'fromStageId',
  'toStageId',
])
@Index(
  'UQ_qualification_snapshot_current',
  ['tournamentId', 'fromStageId', 'toStageId'],
  {
    unique: true,
    where: `"status" = 'confirmed' AND "is_current" = true`,
  },
)
@Check('CHK_qualification_snapshot_revision', '"revision" > 0')
export class QualificationSnapshotEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'tournament_id',
    foreignKeyConstraintName: 'FK_qualification_snapshot_tournament',
  })
  tournament: TournamentEntity;

  @Column({ name: 'from_stage_id' })
  fromStageId: number;

  @ManyToOne(() => TournamentStageEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'from_stage_id',
    foreignKeyConstraintName: 'FK_qualification_snapshot_from_stage',
  })
  fromStage: TournamentStageEntity;

  @Column({ name: 'to_stage_id' })
  toStageId: number;

  @ManyToOne(() => TournamentStageEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'to_stage_id',
    foreignKeyConstraintName: 'FK_qualification_snapshot_to_stage',
  })
  toStage: TournamentStageEntity;

  @Column({ name: 'rule_version_id' })
  ruleVersionId: number;

  @ManyToOne(() => TournamentRuleVersionEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'rule_version_id',
    foreignKeyConstraintName: 'FK_qualification_snapshot_rule_version',
  })
  ruleVersion: TournamentRuleVersionEntity;

  @Column({ type: 'int' })
  revision: number;

  @Column({
    type: 'enum',
    enum: QualificationSnapshotStatus,
    enumName: 'qualification_snapshot_status_enum',
    default: QualificationSnapshotStatus.PREVIEW,
  })
  status: QualificationSnapshotStatus;

  @Column({ name: 'is_current', default: false })
  isCurrent: boolean;

  @Column({ name: 'source_hash', length: 64 })
  sourceHash: string;

  @Column({ name: 'transition_config', type: 'jsonb' })
  transitionConfig: StageTransitionRuleV1;

  @Column({ name: 'resolution_input', type: 'jsonb' })
  resolutionInput: QualificationResolutionInput;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt?: Date;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'created_by_user_id',
    foreignKeyConstraintName: 'FK_qualification_snapshot_created_by',
  })
  createdByUser?: UserEntity;

  @Column({ name: 'confirmed_by_user_id', nullable: true })
  confirmedByUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'confirmed_by_user_id',
    foreignKeyConstraintName: 'FK_qualification_snapshot_confirmed_by',
  })
  confirmedByUser?: UserEntity;

  @Column({ name: 'supersedes_snapshot_id', nullable: true })
  supersedesSnapshotId?: number;

  @ManyToOne(() => QualificationSnapshotEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'supersedes_snapshot_id',
    foreignKeyConstraintName: 'FK_qualification_snapshot_supersedes',
  })
  supersedesSnapshot?: QualificationSnapshotEntity;

  @OneToMany(() => QualificationSnapshotEntryEntity, (entry) => entry.snapshot)
  entries: QualificationSnapshotEntryEntity[];
}
