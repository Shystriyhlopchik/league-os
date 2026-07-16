import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  Unique,
} from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEntity } from '../../matches/entities/match.entity';
import { MatchRoundType } from '../../matches/enums/match-round-type.enum';
import type { KnockoutParticipantSourceV1 } from '../../tournament-rules/types/tournament-rules-config.type';
import { KnockoutBracketSnapshotEntity } from './knockout-bracket-snapshot.entity';

@Entity('tournament_knockout_bracket_plans')
@Unique('UQ_knockout_plan_snapshot_position', ['snapshotId', 'bracketPosition'])
@Unique('UQ_knockout_plan_snapshot_order', ['snapshotId', 'order'])
@Index('IDX_knockout_plan_snapshot', ['snapshotId'])
@Check('CHK_knockout_plan_order', '"order" > 0')
@Check('CHK_knockout_plan_round_number', '"round_number" > 0')
export class KnockoutBracketPlanEntity extends BaseEntity {
  @Column({ name: 'snapshot_id' })
  snapshotId: number;

  @ManyToOne(
    () => KnockoutBracketSnapshotEntity,
    (snapshot) => snapshot.plans,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'snapshot_id',
    foreignKeyConstraintName: 'FK_knockout_plan_snapshot',
  })
  snapshot: KnockoutBracketSnapshotEntity;

  @Column({ type: 'int' })
  order: number;

  @Column({ name: 'bracket_position', length: 100 })
  bracketPosition: string;

  @Column({
    name: 'round_type',
    type: 'enum',
    enum: MatchRoundType,
    enumName: 'match_round_type_enum',
  })
  roundType: MatchRoundType;

  @Column({ name: 'round_number', type: 'int' })
  roundNumber: number;

  @Column({ name: 'home_source', type: 'jsonb' })
  homeSource: KnockoutParticipantSourceV1;

  @Column({ name: 'away_source', type: 'jsonb' })
  awaySource: KnockoutParticipantSourceV1;

  @Column({ name: 'match_id', nullable: true, unique: true })
  matchId?: number;

  @OneToOne(() => MatchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'match_id',
    foreignKeyConstraintName: 'FK_knockout_plan_match',
  })
  match?: MatchEntity;
}
