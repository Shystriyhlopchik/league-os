import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { CommunityEntity } from './community.entity';

export enum CommunityRole {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
}

@Entity('community_members')
@Unique('UQ_community_members_community_user', ['communityId', 'userId'])
export class CommunityMemberEntity extends BaseEntity {
  @Column({ name: 'community_id' }) communityId: number;
  @ManyToOne(() => CommunityEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'community_id' })
  community: CommunityEntity;
  @Column({ name: 'user_id' }) userId: number;
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
  @Column({ type: 'varchar', length: 16 }) role: CommunityRole;
  @Column({ default: true }) isActive: boolean;
}
