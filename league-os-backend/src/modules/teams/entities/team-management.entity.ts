import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TeamEntity } from './team.entity';

@Entity('team_managers')
@Unique(['communityId', 'teamId', 'userId'])
export class TeamManagerEntity extends BaseEntity {
  @Column({ name: 'community_id' }) communityId: number;
  @Column({ name: 'team_id' }) teamId: number;
  @Column({ name: 'user_id' }) userId: number;
  @Column({ type: 'varchar' }) role: 'owner' | 'manager';
  @Column({ default: true }) isActive: boolean;
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}

@Entity('team_access_requests')
@Index('UQ_team_access_pending', ['communityId', 'teamId', 'userId'], {
  unique: true,
  where: "status = 'pending'",
})
export class TeamAccessRequestEntity extends BaseEntity {
  @Column({ name: 'community_id' }) communityId: number;
  @Column({ name: 'team_id' }) teamId: number;
  @Column({ name: 'user_id' }) userId: number;
  @Column({ type: 'text' }) reason: string;
  @Column({ default: 'pending' }) status: string;
  @Column({ name: 'reviewed_by_user_id', type: 'int', nullable: true })
  reviewedByUserId: number | null;
  @Column({ type: 'text', nullable: true }) comment: string | null;
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;
}

@Entity('team_management_audit')
export class TeamManagementAuditEntity extends BaseEntity {
  @Column({ name: 'community_id' }) communityId: number;
  @Column({ name: 'team_id' }) teamId: number;
  @Column({ name: 'actor_user_id', type: 'int', nullable: true }) actorUserId:
    | number
    | null;
  @Column({ name: 'target_user_id', type: 'int', nullable: true })
  targetUserId: number | null;
  @Column() action: string;
  @Column({ type: 'text', nullable: true }) comment: string | null;
}
