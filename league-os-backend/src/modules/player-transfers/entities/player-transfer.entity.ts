import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { PlayerEntity } from '../../players/entities/player.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { TeamPlayerEntity } from '../../team-players/entities/team-players.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('player_transfers')
export class PlayerTransferEntity extends BaseEntity {
  @Column({ name: 'player_id' }) playerId: number;
  @ManyToOne(() => PlayerEntity, { nullable: false })
  @JoinColumn({ name: 'player_id' }) player: PlayerEntity;

  @Column({ name: 'from_team_id' }) fromTeamId: number;
  @ManyToOne(() => TeamEntity, { nullable: false })
  @JoinColumn({ name: 'from_team_id' }) fromTeam: TeamEntity;

  @Column({ name: 'to_team_id' }) toTeamId: number;
  @ManyToOne(() => TeamEntity, { nullable: false })
  @JoinColumn({ name: 'to_team_id' }) toTeam: TeamEntity;

  @Column({ name: 'from_team_player_id' }) fromTeamPlayerId: number;
  @ManyToOne(() => TeamPlayerEntity, { nullable: false })
  @JoinColumn({ name: 'from_team_player_id' }) fromTeamPlayer: TeamPlayerEntity;

  @Column({ name: 'to_team_player_id' }) toTeamPlayerId: number;
  @ManyToOne(() => TeamPlayerEntity, { nullable: false })
  @JoinColumn({ name: 'to_team_player_id' }) toTeamPlayer: TeamPlayerEntity;

  @Column({ name: 'transfer_date', type: 'date' }) transferDate: string;
  @Column({ type: 'text', nullable: true }) comment?: string;
  @Column({ name: 'created_by_user_id' }) createdByUserId: number;
  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by_user_id' }) createdByUser: UserEntity;
}
