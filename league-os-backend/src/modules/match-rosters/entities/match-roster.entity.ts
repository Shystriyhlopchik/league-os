import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEntity } from '../../matches/entities/match.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('match_rosters')
@Unique(['matchId', 'teamId'])
export class MatchRosterEntity extends BaseEntity {
  @Column({ name: 'match_id' })
  matchId: number;

  @ManyToOne(() => MatchEntity, { nullable: false })
  @JoinColumn({ name: 'match_id' })
  match: MatchEntity;

  @Column({ name: 'team_id' })
  teamId: number;

  @ManyToOne(() => TeamEntity, { nullable: false })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @Column({ name: 'is_approved', default: false })
  isApproved: boolean;

  @Column({ name: 'is_submitted', default: false })
  isSubmitted: boolean;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt?: Date;

  @Column({ name: 'submitted_by_user_id', nullable: true })
  submittedByUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'submitted_by_user_id' })
  submittedByUser?: UserEntity;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'approved_by_user_id', nullable: true })
  approvedByUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'approved_by_user_id' })
  approvedByUser?: UserEntity;
}
