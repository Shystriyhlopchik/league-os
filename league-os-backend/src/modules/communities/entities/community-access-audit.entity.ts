import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { CommunityEntity } from './community.entity';

@Entity('community_access_audit')
export class CommunityAccessAuditEntity extends BaseEntity {
  @Column({ name: 'community_id' }) communityId: number;
  @ManyToOne(() => CommunityEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'community_id' })
  community: CommunityEntity;
  // Identifiers remain in the audit even if an account is subsequently removed.
  @Column({ name: 'actor_user_id', type: 'integer', nullable: true })
  actorUserId: number | null;
  @Column({ name: 'target_user_id' }) targetUserId: number;
  @Column({ name: 'previous_role', type: 'varchar', nullable: true })
  previousRole: string | null;
  @Column({ name: 'new_role', type: 'varchar', nullable: true }) newRole:
    | string
    | null;
  @Column({ default: 'web' }) source: string;
}
