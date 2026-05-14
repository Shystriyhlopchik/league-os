import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { SeasonEntity } from '../../seasons/entities/season.entity';

@Entity('competitions')
export class CompetitionEntity extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ length: 7, nullable: true })
  colorPrimary?: string;

  @Column({ length: 7, nullable: true })
  colorSecondary?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  type?: string;

  @Column({ nullable: true })
  region?: string;

  @OneToMany(() => SeasonEntity, (season) => season.competition)
  seasons: SeasonEntity[];
}
