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
import { QualificationSnapshotEntity } from '../../tournament-qualifications/entities/qualification-snapshot.entity';
import { TournamentRuleVersionEntity } from '../../tournament-rules/entities/tournament-rule-version.entity';
import type { BracketRuleV1 } from '../../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { KnockoutBracketSnapshotStatus } from '../enums/knockout-bracket-snapshot-status.enum';
import type { KnockoutSeedingInput } from '../types/knockout-bracket.type';
import { KnockoutBracketPlanEntity } from './knockout-bracket-plan.entity';

@Entity('tournament_knockout_bracket_snapshots')
@Unique('UQ_knockout_snapshot_stage_revision', [
  'tournamentId',
  'stageId',
  'revision',
])
@Index('IDX_knockout_snapshot_stage', ['tournamentId', 'stageId'])
@Index('UQ_knockout_snapshot_current', ['tournamentId', 'stageId'], {
  unique: true,
  where: `"status" = 'confirmed' AND "is_current" = true`,
})
@Check('CHK_knockout_snapshot_revision', '"revision" > 0')
export class KnockoutBracketSnapshotEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'tournament_id',
    foreignKeyConstraintName: 'FK_knockout_snapshot_tournament',
  })
  tournament: TournamentEntity;

  @Column({ name: 'stage_id' })
  stageId: number;

  @ManyToOne(() => TournamentStageEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'stage_id',
    foreignKeyConstraintName: 'FK_knockout_snapshot_stage',
  })
  stage: TournamentStageEntity;

  @Column({ name: 'qualification_snapshot_id' })
  qualificationSnapshotId: number;

  @ManyToOne(() => QualificationSnapshotEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'qualification_snapshot_id',
    foreignKeyConstraintName: 'FK_knockout_snapshot_qualification',
  })
  qualificationSnapshot: QualificationSnapshotEntity;

  @Column({ name: 'rule_version_id' })
  ruleVersionId: number;

  @ManyToOne(() => TournamentRuleVersionEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'rule_version_id',
    foreignKeyConstraintName: 'FK_knockout_snapshot_rule_version',
  })
  ruleVersion: TournamentRuleVersionEntity;

  @Column({ type: 'int' })
  revision: number;

  @Column({
    type: 'enum',
    enum: KnockoutBracketSnapshotStatus,
    enumName: 'knockout_bracket_snapshot_status_enum',
    default: KnockoutBracketSnapshotStatus.PREVIEW,
  })
  status: KnockoutBracketSnapshotStatus;

  @Column({ name: 'is_current', default: false })
  isCurrent: boolean;

  @Column({ name: 'source_hash', length: 64 })
  sourceHash: string;

  @Column({ name: 'bracket_config', type: 'jsonb' })
  bracketConfig: BracketRuleV1;

  @Column({ name: 'seeding_input', type: 'jsonb' })
  seedingInput: KnockoutSeedingInput;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt?: Date;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'created_by_user_id',
    foreignKeyConstraintName: 'FK_knockout_snapshot_created_by',
  })
  createdByUser?: UserEntity;

  @Column({ name: 'confirmed_by_user_id', nullable: true })
  confirmedByUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'confirmed_by_user_id',
    foreignKeyConstraintName: 'FK_knockout_snapshot_confirmed_by',
  })
  confirmedByUser?: UserEntity;

  @OneToMany(() => KnockoutBracketPlanEntity, (plan) => plan.snapshot)
  plans: KnockoutBracketPlanEntity[];
}
