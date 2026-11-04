import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

export interface PlayerIdentity {
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
}

@Entity('player_profile_changes')
@Index('UQ_player_profile_pending', ['playerId'], {
  unique: true,
  where: "status = 'submitted'",
})
export class PlayerProfileChangeEntity extends BaseEntity {
  @Column({ name: 'player_id' }) playerId: number;
  @Column({ name: 'community_id' }) communityId: number;
  @Column({ name: 'team_id', type: 'int', nullable: true }) teamId:
    number | null;
  @Column({ name: 'requested_by_user_id' }) requestedByUserId: number;
  @Column({ name: 'base_version' }) baseVersion: number;
  @Column({ type: 'jsonb' }) before: PlayerIdentity;
  @Column({ type: 'jsonb' }) after: PlayerIdentity;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'varchar', default: 'submitted' }) status:
    'submitted' | 'approved' | 'changes_requested';
  @Column({ name: 'reviewed_by_user_id', type: 'int', nullable: true })
  reviewedByUserId: number | null;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
  @Column({ type: 'text', nullable: true }) comment: string | null;
}

@Entity('player_profile_audit')
export class PlayerProfileAuditEntity extends BaseEntity {
  @Column({ name: 'player_id' }) playerId: number;
  @Column({ name: 'community_id' }) communityId: number;
  @Column({ name: 'actor_user_id' }) actorUserId: number;
  @Column({ name: 'change_id', type: 'int', nullable: true }) changeId:
    number | null;
  @Column() action: string;
  @Column({ type: 'jsonb' }) before: Record<string, unknown>;
  @Column({ type: 'jsonb' }) after: Record<string, unknown>;
  @Column({ type: 'text' }) reason: string;
}
