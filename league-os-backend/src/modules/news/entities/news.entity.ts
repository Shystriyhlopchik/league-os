import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { CommunityEntity } from '../../communities/entities/community.entity';

@Entity('news')
@Index('IDX_news_publication', ['status', 'publishedAt'])
export class NewsEntity extends BaseEntity {
  @Column({ name: 'slug_locked', default: false })
  slugLocked: boolean;

  @Column({ name: 'community_id' })
  communityId: number;

  @ManyToOne(() => CommunityEntity)
  @JoinColumn({ name: 'community_id' })
  community: CommunityEntity;

  @Column({ name: 'vk_title', type: 'varchar', length: 180, nullable: true })
  vkTitle: string | null;

  @Column({ name: 'vk_text', type: 'text', nullable: true })
  vkText: string | null;

  @Column({ name: 'vk_image_url', type: 'varchar', nullable: true })
  vkImageUrl: string | null;

  @Column()
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  excerpt?: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', nullable: true })
  coverUrl?: string | null;

  @Column({ default: 'draft' })
  status: 'draft' | 'published';

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date | null;

  @Column({ name: 'author_user_id', nullable: true })
  authorUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_user_id' })
  author?: UserEntity;

  @Column({ name: 'updated_by_user_id', nullable: true })
  updatedByUserId?: number;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedBy?: UserEntity;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date;
}
