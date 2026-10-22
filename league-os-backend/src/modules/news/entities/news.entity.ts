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

@Entity('news')
@Index('IDX_news_publication', ['status', 'publishedAt'])
export class NewsEntity extends BaseEntity {
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
