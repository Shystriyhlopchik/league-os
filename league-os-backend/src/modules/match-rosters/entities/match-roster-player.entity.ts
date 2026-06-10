import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { PlayerEntity } from '../../players/entities/player.entity';
import { PlayerPosition } from '../../players/enums/player-position.enum';
import { MatchRosterEntity } from './match-roster.entity';
import { TeamPlayerEntity } from '../../team-players/entities/team-players.entity';

@Entity('match_roster_players')
@Unique(['matchRosterId', 'playerId'])
export class MatchRosterPlayerEntity extends BaseEntity {
  @Column({ name: 'match_roster_id' })
  matchRosterId: number;

  @ManyToOne(() => MatchRosterEntity, { nullable: false })
  @JoinColumn({ name: 'match_roster_id' })
  matchRoster: MatchRosterEntity;

  @Column({ name: 'player_id' })
  playerId: number;

  @ManyToOne(() => PlayerEntity, { nullable: false })
  @JoinColumn({ name: 'player_id' })
  player: PlayerEntity;

  @Column({ name: 'team_player_id', nullable: true })
  teamPlayerId?: number;

  @ManyToOne(() => TeamPlayerEntity, { nullable: true })
  @JoinColumn({ name: 'team_player_id' })
  teamPlayer?: TeamPlayerEntity;

  @Column({ name: 'shirt_number', nullable: true })
  shirtNumber?: number;

  @Column({
    type: 'enum',
    enum: PlayerPosition,
    nullable: true,
  })
  position?: PlayerPosition;

  @Column({ name: 'is_captain', default: false })
  isCaptain: boolean;

  @Column({ name: 'was_allowed', default: true })
  wasAllowed: boolean;
}
