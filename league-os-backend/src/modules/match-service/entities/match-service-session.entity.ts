import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
} from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEntity } from '../../matches/entities/match.entity';
import { MatchServiceStatus } from '../enums/match-service-status.enum';

@Entity('match_service_sessions')
export class MatchServiceSessionEntity extends BaseEntity {
  @Column({ name: 'match_id', unique: true })
  matchId: number;

  @OneToOne(() => MatchEntity, { nullable: false })
  @JoinColumn({ name: 'match_id' })
  match: MatchEntity;

  @Column({
    type: 'enum',
    enum: MatchServiceStatus,
    default: MatchServiceStatus.NOT_STARTED,
  })
  status: MatchServiceStatus;

  @Column({
    name: 'previous_status',
    type: 'enum',
    enum: MatchServiceStatus,
    nullable: true,
  })
  previousStatus?: MatchServiceStatus | null;

  @Column({ name: 'current_half', default: 1 })
  currentHalf: number;

  @Column({ name: 'elapsed_seconds', default: 0 })
  elapsedSeconds: number;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'paused_at', type: 'timestamp', nullable: true })
  pausedAt?: Date | null;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt?: Date | null;

  @Column({ name: 'home_score', default: 0 })
  homeScore: number;

  @Column({ name: 'away_score', default: 0 })
  awayScore: number;
}