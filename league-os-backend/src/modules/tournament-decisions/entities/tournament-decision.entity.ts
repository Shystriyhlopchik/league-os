import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TournamentDecisionStatus } from '../enums/tournament-decision-status.enum';
import { TournamentDecisionType } from '../enums/tournament-decision-type.enum';
import type {
  TournamentDecisionAffectedEntity,
  TournamentDecisionValues,
} from '../types/tournament-decision.type';

@Entity('tournament_decisions')
@Index('IDX_tournament_decisions_tournament_effective', [
  'tournamentId',
  'effectiveAt',
])
@Index('IDX_tournament_decisions_type_status', [
  'tournamentId',
  'type',
  'status',
])
@Index('IDX_tournament_decisions_reverses', ['reversesDecisionId'])
export class TournamentDecisionEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournament_id' })
  tournament: TournamentEntity;

  @Column({
    type: 'enum',
    enum: TournamentDecisionType,
    enumName: 'tournament_decision_type_enum',
  })
  type: TournamentDecisionType;

  @Column({
    type: 'enum',
    enum: TournamentDecisionStatus,
    enumName: 'tournament_decision_status_enum',
    default: TournamentDecisionStatus.ACTIVE,
  })
  status: TournamentDecisionStatus;

  @Column({ name: 'author_user_id', nullable: true })
  authorUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_user_id' })
  author?: UserEntity;

  @Column({ length: 500 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ name: 'affected_entities', type: 'jsonb' })
  affectedEntities: TournamentDecisionAffectedEntity[];

  @Column({ name: 'values_before', type: 'jsonb' })
  valuesBefore: TournamentDecisionValues;

  @Column({ name: 'values_after', type: 'jsonb' })
  valuesAfter: TournamentDecisionValues;

  @Column({ name: 'effective_at', type: 'timestamp' })
  effectiveAt: Date;

  @Column({ name: 'reverses_decision_id', nullable: true })
  reversesDecisionId?: number;

  @ManyToOne(() => TournamentDecisionEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'reverses_decision_id' })
  reversesDecision?: TournamentDecisionEntity;
}
