import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { BaseEntity } from '../../../common/base/base.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentRuleVersionEntity } from '../../tournament-rules/entities/tournament-rule-version.entity';
import type { TieBreakReason } from '../types/tie-break-reason.type';

@Entity('standings')
@Index('UQ_standings_legacy_tournament_team', ['tournamentId', 'teamId'], {
  unique: true,
  where: '"stage_id" IS NULL',
})
@Index('UQ_standings_stage_team_without_group', ['stageId', 'teamId'], {
  unique: true,
  where: '"stage_id" IS NOT NULL AND "group_id" IS NULL',
})
@Index('UQ_standings_stage_group_team', ['stageId', 'groupId', 'teamId'], {
  unique: true,
  where: '"group_id" IS NOT NULL',
})
@Index('IDX_standings_stage_group_position', ['stageId', 'groupId', 'position'])
export class StandingEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, { nullable: false })
  @JoinColumn({ name: 'tournament_id' })
  tournament: TournamentEntity;

  @Column({ name: 'stage_id', nullable: true })
  stageId?: number;

  @ManyToOne(() => TournamentStageEntity, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stage_id' })
  stage?: TournamentStageEntity;

  @Column({ name: 'group_id', nullable: true })
  groupId?: number;

  @ManyToOne(() => TournamentGroupEntity, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id' })
  group?: TournamentGroupEntity;

  @Column({ name: 'rule_version_id', nullable: true })
  ruleVersionId?: number;

  @ManyToOne(() => TournamentRuleVersionEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'rule_version_id' })
  ruleVersion?: TournamentRuleVersionEntity;

  @Column({ name: 'team_id' })
  teamId: number;

  @ManyToOne(() => TeamEntity, { nullable: false })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @Column({ nullable: true })
  position?: number;

  @Column({ default: 0 })
  played: number;

  @Column({ default: 0 })
  wins: number;

  @Column({ default: 0 })
  draws: number;

  @Column({ default: 0 })
  losses: number;

  @Column({ default: 0 })
  goalsFor: number;

  @Column({ default: 0 })
  goalsAgainst: number;

  @Column({ default: 0 })
  goalDifference: number;

  @Column({ default: 0 })
  points: number;

  @Column({ name: 'disciplinary_score', type: 'int', default: 0 })
  disciplinaryScore: number;

  @Column({ name: 'manual_decision_rank', type: 'int', nullable: true })
  manualDecisionRank?: number;

  @Column({ name: 'draw_rank', type: 'int', nullable: true })
  drawRank?: number;

  @Column({ name: 'tie_break_reason', type: 'jsonb', nullable: true })
  tieBreakReason?: TieBreakReason;
}
