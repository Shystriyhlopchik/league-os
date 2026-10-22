import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import { TournamentStageParticipantStatus } from '../enums/tournament-stage-participant-status.enum';

@Entity('tournament_stage_participants')
@Unique('UQ_stage_participants_stage_tournament_team', [
  'stageId',
  'tournamentTeamId',
])
@Index('IDX_stage_participants_stage', ['stageId'])
@Index('IDX_stage_participants_group', ['groupId'])
@Index('IDX_stage_participants_tournament_team', ['tournamentTeamId'])
@Check(
  'CHK_stage_participants_seed',
  '"seed_number" IS NULL OR "seed_number" > 0',
)
export class TournamentStageParticipantEntity extends BaseEntity {
  @Column({ name: 'stage_id' })
  stageId: number;

  @ManyToOne(() => TournamentStageEntity, (stage) => stage.participants, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'stage_id',
    foreignKeyConstraintName: 'FK_stage_participants_stage',
  })
  stage: TournamentStageEntity;

  @Column({ name: 'tournament_team_id' })
  tournamentTeamId: number;

  @ManyToOne(
    () => TournamentTeamEntity,
    (tournamentTeam) => tournamentTeam.stageParticipants,
    { nullable: false, onDelete: 'CASCADE' },
  )
  @JoinColumn({
    name: 'tournament_team_id',
    foreignKeyConstraintName: 'FK_stage_participants_tournament_team',
  })
  tournamentTeam: TournamentTeamEntity;

  @Column({ name: 'group_id', nullable: true })
  groupId?: number;

  @ManyToOne(() => TournamentGroupEntity, (group) => group.participants, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'group_id',
    foreignKeyConstraintName: 'FK_stage_participants_group',
  })
  group?: TournamentGroupEntity;

  @Column({ name: 'seed_number', type: 'int', nullable: true })
  seedNumber?: number;

  @Column({ name: 'qualification_source', length: 100, nullable: true })
  qualificationSource?: string;

  @Column({
    type: 'enum',
    enum: TournamentStageParticipantStatus,
    enumName: 'tournament_stage_participant_status_enum',
    default: TournamentStageParticipantStatus.ACTIVE,
  })
  status: TournamentStageParticipantStatus;
}
