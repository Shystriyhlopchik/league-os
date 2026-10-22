import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import type { QualificationSelectionReason } from '../types/qualification-engine.type';
import { QualificationSnapshotEntity } from './qualification-snapshot.entity';

@Entity('tournament_qualification_snapshot_entries')
@Unique('UQ_qualification_entry_snapshot_team', [
  'snapshotId',
  'tournamentTeamId',
])
@Unique('UQ_qualification_entry_snapshot_order', [
  'snapshotId',
  'selectionOrder',
])
@Index('IDX_qualification_entry_snapshot', ['snapshotId'])
@Check('CHK_qualification_entry_position', '"source_position" > 0')
@Check('CHK_qualification_entry_order', '"selection_order" > 0')
export class QualificationSnapshotEntryEntity extends BaseEntity {
  @Column({ name: 'snapshot_id' })
  snapshotId: number;

  @ManyToOne(
    () => QualificationSnapshotEntity,
    (snapshot) => snapshot.entries,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'snapshot_id',
    foreignKeyConstraintName: 'FK_qualification_entry_snapshot',
  })
  snapshot: QualificationSnapshotEntity;

  @Column({ name: 'tournament_team_id' })
  tournamentTeamId: number;

  @ManyToOne(() => TournamentTeamEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'tournament_team_id',
    foreignKeyConstraintName: 'FK_qualification_entry_tournament_team',
  })
  tournamentTeam: TournamentTeamEntity;

  @Column({ name: 'source_group_id', nullable: true })
  sourceGroupId?: number;

  @ManyToOne(() => TournamentGroupEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'source_group_id',
    foreignKeyConstraintName: 'FK_qualification_entry_source_group',
  })
  sourceGroup?: TournamentGroupEntity;

  @Column({ name: 'source_position', type: 'int' })
  sourcePosition: number;

  @Column({ name: 'qualification_rule_id', length: 100 })
  qualificationRuleId: string;

  @Column({ name: 'selection_order', type: 'int' })
  selectionOrder: number;

  @Column({ name: 'comparison_snapshot', type: 'jsonb' })
  comparisonSnapshot: Record<string, number>;

  @Column({ name: 'selection_reason', type: 'jsonb' })
  selectionReason: QualificationSelectionReason;
}
