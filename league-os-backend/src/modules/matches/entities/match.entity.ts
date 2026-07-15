import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { VenueEntity } from '../../venues/entities/venue.entity';
import { MatchStatus } from '../enums/match-status.enum';
import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEventEntity } from '../../match-events/entities/match-event.entity';
import { MatchOfficialEntity } from '../../match-officials/entities/match-official.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentRuleVersionEntity } from '../../tournament-rules/entities/tournament-rule-version.entity';
import { MatchRoundType } from '../enums/match-round-type.enum';

@Entity('matches')
@Index('IDX_matches_stage', ['stageId'])
@Index('IDX_matches_group', ['groupId'])
@Index('IDX_matches_effective_rule_version', ['effectiveRuleVersionId'])
@Index('IDX_matches_stage_round', ['stageId', 'roundType', 'roundNumber'])
@Check(
  'CHK_matches_round_number',
  '"round_number" IS NULL OR "round_number" > 0',
)
export class MatchEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @Column({ name: 'home_team_id' })
  homeTeamId: number;

  @Column({ name: 'away_team_id' })
  awayTeamId: number;

  @Column({ name: 'venue_id', nullable: true })
  venueId?: number;

  @Column({ name: 'match_datetime', type: 'timestamp', nullable: true })
  matchDatetime?: Date;

  @Column({ nullable: true })
  round?: string;

  @Column({ name: 'stage_id', nullable: true })
  stageId?: number;

  @ManyToOne(() => TournamentStageEntity, (stage) => stage.matches, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'stage_id',
    foreignKeyConstraintName: 'FK_matches_stage',
  })
  stage?: TournamentStageEntity;

  @Column({ name: 'group_id', nullable: true })
  groupId?: number;

  @ManyToOne(() => TournamentGroupEntity, (group) => group.matches, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'group_id',
    foreignKeyConstraintName: 'FK_matches_group',
  })
  group?: TournamentGroupEntity;

  @Column({
    name: 'round_type',
    type: 'enum',
    enum: MatchRoundType,
    enumName: 'match_round_type_enum',
    nullable: true,
  })
  roundType?: MatchRoundType;

  @Column({ name: 'round_number', type: 'int', nullable: true })
  roundNumber?: number;

  @Column({ name: 'bracket_position', length: 100, nullable: true })
  bracketPosition?: string;

  @Column({ name: 'effective_rule_version_id', nullable: true })
  effectiveRuleVersionId?: number;

  @ManyToOne(() => TournamentRuleVersionEntity, (version) => version.matches, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'effective_rule_version_id',
    foreignKeyConstraintName: 'FK_matches_effective_rule_version',
  })
  effectiveRuleVersion?: TournamentRuleVersionEntity;

  @Column({
    type: 'enum',
    enum: MatchStatus,
    default: MatchStatus.SCHEDULED,
  })
  status: MatchStatus;

  @Column({ name: 'home_score', default: 0 })
  homeScore: number;

  @Column({ name: 'away_score', default: 0 })
  awayScore: number;

  @OneToMany(() => MatchEventEntity, (event) => event.match)
  events: MatchEventEntity[];

  @ManyToOne(() => VenueEntity, { nullable: true })
  @JoinColumn({ name: 'venue_id' })
  venue?: VenueEntity;

  @ManyToOne(() => TeamEntity, { nullable: false })
  @JoinColumn({ name: 'away_team_id' })
  awayTeam: TeamEntity;

  @ManyToOne(() => TeamEntity, { nullable: false })
  @JoinColumn({ name: 'home_team_id' })
  homeTeam: TeamEntity;

  @ManyToOne(() => TournamentEntity, { nullable: false })
  @JoinColumn({ name: 'tournament_id' })
  tournament: TournamentEntity;

  @OneToMany(() => MatchOfficialEntity, (official) => official.match)
  officials: MatchOfficialEntity[];
}
