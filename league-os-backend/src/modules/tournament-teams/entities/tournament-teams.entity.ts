import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { TournamentTeamStatus } from '../enums/tournament-team-status.enum';
import { BaseEntity } from '../../../common/base/base.entity';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TeamRatingResult } from '../enums/team-rating-result.enum';

@Entity('tournament_teams')
export class TournamentTeamEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, { nullable: false })
  @JoinColumn({ name: 'tournament_id' })
  tournament: TournamentEntity;

  @Column({ name: 'team_id' })
  teamId: number;

  @ManyToOne(() => TeamEntity, { nullable: false })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @Column({ nullable: true })
  groupName?: string;

  @Column({ nullable: true })
  seedNumber?: number;

  @Column({
    type: 'enum',
    enum: TournamentTeamStatus,
    default: TournamentTeamStatus.ACTIVE,
  })
  status: TournamentTeamStatus;

  @Column({
    name: 'rating_result',
    type: 'enum',
    enum: TeamRatingResult,
    enumName: 'team_rating_result_enum',
    nullable: true,
  })
  ratingResult?: TeamRatingResult;

  @OneToMany(
    () => TournamentStageParticipantEntity,
    (participant) => participant.tournamentTeam,
  )
  stageParticipants: TournamentStageParticipantEntity[];
}
