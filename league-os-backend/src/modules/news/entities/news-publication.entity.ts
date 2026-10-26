import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { NewsEntity } from './news.entity';

export type PublicationStatus =
  | 'queued'
  | 'sending'
  | 'published'
  | 'failed'
  | 'unknown';

@Entity('news_publications')
@Index('UQ_news_publications_destination', ['newsId', 'provider'], {
  unique: true,
})
export class NewsPublicationEntity extends BaseEntity {
  @Column({ name: 'news_id' }) newsId: number;
  @ManyToOne(() => NewsEntity)
  @JoinColumn({ name: 'news_id' })
  news: NewsEntity;
  @Column({ name: 'community_id' }) communityId: number;
  @Column({ default: 'vk' }) provider: string;
  @Column({ name: 'group_id', type: 'varchar' }) groupId: string;
  @Column({ type: 'varchar' }) status: PublicationStatus;
  @Column({ type: 'text' }) message: string;
  @Column({ name: 'article_url', type: 'text' }) articleUrl: string;
  @Column({ name: 'image_url', type: 'varchar', nullable: true }) imageUrl:
    | string
    | null;
  @Column({ type: 'uuid' }) guid: string;
  @Column({ default: 0 }) attempts: number;
  @Column({ name: 'requested_by_user_id', type: 'int', nullable: true })
  requestedByUserId: number | null;
  @Column({ name: 'last_requested_by_user_id', type: 'int', nullable: true })
  lastRequestedByUserId: number | null;
  @Column({ name: 'next_attempt_at', type: 'timestamptz' }) nextAttemptAt: Date;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ name: 'post_url', type: 'text', nullable: true }) postUrl:
    | string
    | null;
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;
}
