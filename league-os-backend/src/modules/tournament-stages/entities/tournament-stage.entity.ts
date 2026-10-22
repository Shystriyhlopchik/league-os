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
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { TournamentStageStatus } from '../enums/tournament-stage-status.enum';
import { TournamentStageType } from '../enums/tournament-stage-type.enum';
import type { TournamentStageConfiguration } from '../types/tournament-stage-configuration.type';

@Entity('tournament_stages')
@Unique('UQ_tournament_stages_tournament_key', ['tournamentId', 'key'])
@Unique('UQ_tournament_stages_tournament_order', ['tournamentId', 'order'])
@Index('IDX_tournament_stages_tournament', ['tournamentId'])
@Check('CHK_tournament_stages_order', '"order" > 0')
export class TournamentStageEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, (tournament) => tournament.stages, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'tournament_id',
    foreignKeyConstraintName: 'FK_tournament_stages_tournament',
  })
  tournament: TournamentEntity;

  @Column({ length: 100 })
  key: string;

  @Column({ length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: TournamentStageType,
    enumName: 'tournament_stage_type_enum',
  })
  type: TournamentStageType;

  @Column({ type: 'int' })
  order: number;

  @Column({
    type: 'enum',
    enum: TournamentStageStatus,
    enumName: 'tournament_stage_status_enum',
    default: TournamentStageStatus.PENDING,
  })
  status: TournamentStageStatus;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate?: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  configuration: Partial<TournamentStageConfiguration>;

  @OneToMany(() => TournamentGroupEntity, (group) => group.stage)
  groups: TournamentGroupEntity[];

  @OneToMany(
    () => TournamentStageParticipantEntity,
    (participant) => participant.stage,
  )
  participants: TournamentStageParticipantEntity[];

  @OneToMany(() => MatchEntity, (match) => match.stage)
  matches: MatchEntity[];
}
