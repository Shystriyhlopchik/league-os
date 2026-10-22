import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEntity } from '../../matches/entities/match.entity';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentGroupStatus } from '../enums/tournament-group-status.enum';

@Entity('tournament_groups')
@Unique('UQ_tournament_groups_stage_key', ['stageId', 'key'])
@Unique('UQ_tournament_groups_stage_order', ['stageId', 'order'])
@Index('IDX_tournament_groups_stage', ['stageId'])
@Check('CHK_tournament_groups_order', '"order" > 0')
@Check(
  'CHK_tournament_groups_capacity',
  '"capacity" IS NULL OR "capacity" >= 2',
)
export class TournamentGroupEntity extends BaseEntity {
  @Column({ name: 'stage_id' })
  stageId: number;

  @ManyToOne(() => TournamentStageEntity, (stage) => stage.groups, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'stage_id',
    foreignKeyConstraintName: 'FK_tournament_groups_stage',
  })
  stage: TournamentStageEntity;

  @Column({ length: 50 })
  key: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'int' })
  order: number;

  @Column({ type: 'int', nullable: true })
  capacity?: number;

  @Column({
    type: 'enum',
    enum: TournamentGroupStatus,
    enumName: 'tournament_group_status_enum',
    default: TournamentGroupStatus.DRAFT,
  })
  status: TournamentGroupStatus;

  @OneToMany(
    () => TournamentStageParticipantEntity,
    (participant) => participant.group,
  )
  participants: TournamentStageParticipantEntity[];

  @OneToMany(() => MatchEntity, (match) => match.group)
  matches: MatchEntity[];
}
