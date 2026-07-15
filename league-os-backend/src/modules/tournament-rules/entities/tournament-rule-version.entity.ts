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
import { UserEntity } from '../../users/entities/user.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { TournamentRuleVersionStatus } from '../enums/tournament-rule-version-status.enum';
import type { TournamentRulesConfig } from '../types/tournament-rules-config.type';

@Entity('tournament_rule_versions')
@Unique('UQ_tournament_rule_versions_tournament_version', [
  'tournamentId',
  'version',
])
@Index('IDX_tournament_rule_versions_tournament', ['tournamentId'])
@Index('IDX_tournament_rule_versions_status', ['status'])
@Check('CHK_tournament_rule_versions_version', '"version" > 0')
@Check('CHK_tournament_rule_versions_schema_version', '"schema_version" > 0')
export class TournamentRuleVersionEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @ManyToOne(() => TournamentEntity, (tournament) => tournament.ruleVersions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'tournament_id',
    foreignKeyConstraintName: 'FK_rule_versions_tournament',
  })
  tournament: TournamentEntity;

  @Column({ type: 'int' })
  version: number;

  @Column({ name: 'schema_version', type: 'int', default: 1 })
  schemaVersion: number;

  @Column({ type: 'jsonb' })
  config: TournamentRulesConfig;

  @Column({
    type: 'enum',
    enum: TournamentRuleVersionStatus,
    enumName: 'tournament_rule_version_status_enum',
    default: TournamentRuleVersionStatus.DRAFT,
  })
  status: TournamentRuleVersionStatus;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt?: Date;

  @Column({ name: 'based_on_version_id', nullable: true })
  basedOnVersionId?: number;

  @ManyToOne(() => TournamentRuleVersionEntity, { nullable: true })
  @JoinColumn({
    name: 'based_on_version_id',
    foreignKeyConstraintName: 'FK_rule_versions_based_on',
  })
  basedOnVersion?: TournamentRuleVersionEntity;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId?: number;

  @ManyToOne(() => UserEntity, (user) => user.createdTournamentRuleVersions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'created_by_user_id',
    foreignKeyConstraintName: 'FK_rule_versions_created_by',
  })
  createdByUser?: UserEntity;

  @Column({ name: 'published_by_user_id', nullable: true })
  publishedByUserId?: number;

  @ManyToOne(() => UserEntity, (user) => user.publishedTournamentRuleVersions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'published_by_user_id',
    foreignKeyConstraintName: 'FK_rule_versions_published_by',
  })
  publishedByUser?: UserEntity;

  @Column({ name: 'change_summary', type: 'text', nullable: true })
  changeSummary?: string;

  @OneToMany(() => MatchEntity, (match) => match.effectiveRuleVersion)
  matches: MatchEntity[];
}
