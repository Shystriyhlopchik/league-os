import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

@Entity('communities')
export class CommunityEntity extends BaseEntity {
  @Column() name: string;
  @Column({ unique: true }) slug: string;
  @Column({ default: true }) isActive: boolean;
  @Column({ default: false }) isDefault: boolean;
}
