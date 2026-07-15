import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { SeasonEntity } from '../../seasons/entities/season.entity';
import { BaseEntity } from '../../../common/base/base.entity';
import { TournamentStatus } from '../enums/tournament-status.enum';
import { TournamentFormat } from '../enums/tournament-format.enum';
import { TournamentType } from '../enums/tournament-type.enum';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import { StandingEntity } from '../../standings/entities/standing.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentRuleVersionEntity } from '../../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentMemberEntity } from '../../tournament-members/entities/tournament-member.entity';
import { TournamentLifecycleStatus } from '../enums/tournament-lifecycle-status.enum';

@Entity('tournaments')
@Index('IDX_tournaments_owner_user', ['ownerUserId'])
@Index('IDX_tournaments_active_rule_version', ['activeRuleVersionId'])
export class TournamentEntity extends BaseEntity {
  @Column({ name: 'season_id' })
  seasonId: number;

  @Column()
  name: string;

  @Column()
  slug: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: TournamentType,
    nullable: true,
  })
  type?: TournamentType;

  @Column({
    type: 'enum',
    enum: TournamentFormat,
    nullable: true,
  })
  format?: TournamentFormat;

  @Column({ type: 'date', nullable: true })
  startDate?: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string;

  @Column({
    type: 'enum',
    enum: TournamentStatus,
    default: TournamentStatus.PLANNED,
  })
  status: TournamentStatus;

  @Column({ length: 7, nullable: true })
  colorPrimary?: string;

  @Column({ length: 7, nullable: true })
  colorSecondary?: string;

  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ name: 'owner_user_id', nullable: true })
  ownerUserId?: number;

  @ManyToOne(() => UserEntity, (user) => user.ownedTournaments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'owner_user_id',
    foreignKeyConstraintName: 'FK_tournaments_owner',
  })
  owner?: UserEntity;

  @Column({
    name: 'lifecycle_status',
    type: 'enum',
    enum: TournamentLifecycleStatus,
    enumName: 'tournament_lifecycle_status_enum',
    nullable: true,
  })
  lifecycleStatus?: TournamentLifecycleStatus;

  @Column({ name: 'active_rule_version_id', nullable: true })
  activeRuleVersionId?: number;

  @ManyToOne(() => TournamentRuleVersionEntity, { nullable: true })
  @JoinColumn({
    name: 'active_rule_version_id',
    foreignKeyConstraintName: 'FK_tournaments_active_rule',
  })
  activeRuleVersion?: TournamentRuleVersionEntity;

  @ManyToOne(() => SeasonEntity, { nullable: false })
  @JoinColumn({ name: 'season_id' })
  season: SeasonEntity;

  @OneToMany(
    () => TournamentTeamEntity,
    (tournamentTeam) => tournamentTeam.tournament,
  )
  tournamentTeams: TournamentTeamEntity[];

  @OneToMany(() => StandingEntity, (standing) => standing.tournament)
  standings: StandingEntity[];

  @OneToMany(() => TournamentStageEntity, (stage) => stage.tournament)
  stages: TournamentStageEntity[];

  @OneToMany(
    () => TournamentRuleVersionEntity,
    (ruleVersion) => ruleVersion.tournament,
  )
  ruleVersions: TournamentRuleVersionEntity[];

  @OneToMany(() => TournamentMemberEntity, (member) => member.tournament)
  members: TournamentMemberEntity[];
}
