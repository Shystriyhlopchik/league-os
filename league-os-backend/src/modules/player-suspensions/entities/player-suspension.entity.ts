import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEntity } from '../../matches/entities/match.entity';
import { PlayerEntity } from '../../players/entities/player.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { PlayerSuspensionReason } from '../enums/player-suspension-reason.enum';
import { PlayerSuspensionStatus } from '../enums/player-suspension-status.enum';

@Entity('player_suspensions')
@Index('IDX_player_suspensions_tournament_stage', ['tournamentId', 'stageId'])
@Index('IDX_player_suspensions_player_status', [
  'tournamentId',
  'playerId',
  'status',
])
@Index('IDX_player_suspensions_team_status', [
  'tournamentId',
  'teamId',
  'status',
])
@Index(
  'UQ_player_suspensions_source_reason',
  ['sourceMatchId', 'playerId', 'reason'],
  {
    unique: true,
    where: '"source_match_id" IS NOT NULL',
  },
)
@Check('CHK_player_suspensions_matches_required', '"matches_required" > 0')
@Check('CHK_player_suspensions_matches_served', '"matches_served" >= 0')
@Check(
  'CHK_player_suspensions_progress',
  '"matches_served" <= "matches_required"',
)
export class PlayerSuspensionEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournament_id' })
  tournament: TournamentEntity;

  @Column({ name: 'stage_id', nullable: true })
  stageId?: number;

  @ManyToOne(() => TournamentStageEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'stage_id' })
  stage?: TournamentStageEntity;

  @Column({ name: 'player_id' })
  playerId: number;

  @ManyToOne(() => PlayerEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: PlayerEntity;

  @Column({ name: 'team_id' })
  teamId: number;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @Column({
    type: 'enum',
    enum: PlayerSuspensionReason,
    enumName: 'player_suspension_reason_enum',
  })
  reason: PlayerSuspensionReason;

  @Column({ name: 'matches_required', type: 'int' })
  matchesRequired: number;

  @Column({ name: 'matches_served', type: 'int', default: 0 })
  matchesServed: number;

  @Column({
    type: 'enum',
    enum: PlayerSuspensionStatus,
    enumName: 'player_suspension_status_enum',
    default: PlayerSuspensionStatus.ACTIVE,
  })
  status: PlayerSuspensionStatus;

  @Column({ name: 'source_match_id', nullable: true })
  sourceMatchId?: number;

  @ManyToOne(() => MatchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_match_id' })
  sourceMatch?: MatchEntity;

  @Column({ name: 'manual_decision_id', nullable: true })
  manualDecisionId?: number;

  @Column({ name: 'served_at', type: 'timestamp', nullable: true })
  servedAt?: Date;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt?: Date;
}
