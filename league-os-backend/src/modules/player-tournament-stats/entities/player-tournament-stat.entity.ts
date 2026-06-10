import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEntity } from '../../matches/entities/match.entity';
import { PlayerEntity } from '../../players/entities/player.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { SuspensionReason } from '../enums/suspension-reason.enum';

@Entity('player_tournament_stats')
@Unique(['tournamentId', 'teamId', 'playerId'])
export class PlayerTournamentStatEntity extends BaseEntity {
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

  @Column({ name: 'player_id' })
  playerId: number;

  @ManyToOne(() => PlayerEntity, { nullable: false })
  @JoinColumn({ name: 'player_id' })
  player: PlayerEntity;

  @Column({ name: 'yellow_cards', default: 0 })
  yellowCards: number;

  @Column({ name: 'red_cards', default: 0 })
  redCards: number;

  @Column({ name: 'second_yellow_cards', default: 0 })
  secondYellowCards: number;

  @Column({ name: 'suspensions_served', default: 0 })
  suspensionsServed: number;

  @Column({ name: 'is_suspended', default: false })
  isSuspended: boolean;

  @Column({ name: 'suspended_until_match_id', nullable: true })
  suspendedUntilMatchId?: number;

  @ManyToOne(() => MatchEntity, { nullable: true })
  @JoinColumn({ name: 'suspended_until_match_id' })
  suspendedUntilMatch?: MatchEntity;

  @Column({
    name: 'suspension_reason',
    type: 'enum',
    enum: SuspensionReason,
    nullable: true,
  })
  suspensionReason?: SuspensionReason;
}
