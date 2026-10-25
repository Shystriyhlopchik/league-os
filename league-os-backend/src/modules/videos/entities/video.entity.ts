import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { CommunityEntity } from '../../communities/entities/community.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { MatchEntity } from '../../matches/entities/match.entity';

@Entity('videos')
@Index('IDX_videos_home', { synchronize: false })
export class VideoEntity extends BaseEntity {
  @Column({ name: 'community_id' }) communityId: number;
  @ManyToOne(() => CommunityEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'community_id' })
  community: CommunityEntity;
  @Column({ length: 180 }) title: string;
  @Column({ name: 'embed_url', type: 'text' }) embedUrl: string;
  @Column({ name: 'cover_url', type: 'varchar', nullable: true }) coverUrl:
    | string
    | null;
  @Column({ default: 'draft' }) status: 'draft' | 'published';
  @Column({ name: 'show_on_home', default: true }) showOnHome: boolean;
  @Column({ name: 'sort_order', default: 0 }) sortOrder: number;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ name: 'tournament_id', type: 'int', nullable: true }) tournamentId:
    | number
    | null;
  @ManyToOne(() => TournamentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tournament_id' })
  tournament: TournamentEntity | null;
  @Column({ name: 'match_id', type: 'int', nullable: true }) matchId:
    | number
    | null;
  @ManyToOne(() => MatchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'match_id' })
  match: MatchEntity | null;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
