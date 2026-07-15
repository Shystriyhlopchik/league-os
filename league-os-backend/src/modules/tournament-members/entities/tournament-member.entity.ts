import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TournamentMemberRole } from '../enums/tournament-member-role.enum';

@Entity('tournament_members')
@Unique('UQ_tournament_members_tournament_user', ['tournamentId', 'userId'])
@Index('IDX_tournament_members_tournament', ['tournamentId'])
@Index('IDX_tournament_members_user', ['userId'])
export class TournamentMemberEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, (tournament) => tournament.members, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'tournament_id',
    foreignKeyConstraintName: 'FK_tournament_members_tournament',
  })
  tournament: TournamentEntity;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => UserEntity, (user) => user.tournamentMemberships, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_tournament_members_user',
  })
  user: UserEntity;

  @Column({
    type: 'enum',
    enum: TournamentMemberRole,
    enumName: 'tournament_member_role_enum',
    default: TournamentMemberRole.ORGANIZER,
  })
  role: TournamentMemberRole;
}
