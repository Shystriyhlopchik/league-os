import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

@Entity('news')
export class NewsEntity extends BaseEntity {
  @Column()
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  excerpt?: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true })
  coverUrl?: string;

  @Column({ default: 'draft' })
  status: 'draft' | 'published';

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;
}
