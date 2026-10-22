import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { CommunityEntity } from '../../communities/entities/community.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { PlayerEntity } from '../../players/entities/player.entity';
import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { PlayerPosition } from '../../players/enums/player-position.enum';

export interface RegistrationPolicy {
  version: 1;
  maxPlayers: number;
  minPlayers: number;
  maxRepresentatives: number;
  minMatchPlayers: number;
  maxMatchPlayers: number;
  allowAmendments: boolean;
  deadline: string | null;
}

export const DEFAULT_REGISTRATION_POLICY: RegistrationPolicy = {
  version: 1,
  maxPlayers: 12,
  minPlayers: 5,
  maxRepresentatives: 2,
  minMatchPlayers: 5,
  maxMatchPlayers: 12,
  allowAmendments: true,
  deadline: null,
};

export interface ApplicationPlayer {
  playerId: number;
  teamPlayerId: number;
  shirtNumber?: number;
  position?: PlayerPosition;
  isCaptain: boolean;
  name: string;
}
export interface Representative {
  name: string;
}
export interface ApplicationSnapshot {
  players: ApplicationPlayer[];
  representatives: Representative[];
}

@Entity('community_teams')
@Unique(['communityId', 'teamId'])
export class CommunityTeamEntity extends BaseEntity {
  @Column({ name: 'community_id' }) communityId: number;
  @Column({ name: 'team_id' }) teamId: number;
  @Column({ default: true }) isActive: boolean;
  @ManyToOne(() => CommunityEntity)
  @JoinColumn({ name: 'community_id' })
  community: CommunityEntity;
  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;
}

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'approved';
@Entity('tournament_applications')
@Unique(['tournamentId', 'teamId'])
export class TournamentApplicationEntity extends BaseEntity {
  @Column({ name: 'tournament_id' }) tournamentId: number;
  @Column({ name: 'team_id' }) teamId: number;
  @Column({ type: 'varchar', default: 'draft' }) status: ApplicationStatus;
  @Column({ name: 'current_revision_id', type: 'int', nullable: true })
  currentRevisionId: number | null;
  @Column({ name: 'approved_revision_id', type: 'int', nullable: true })
  approvedRevisionId: number | null;
  @ManyToOne(() => TournamentEntity)
  @JoinColumn({ name: 'tournament_id' })
  tournament: TournamentEntity;
  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;
}

@Entity('tournament_application_revisions')
@Unique(['applicationId', 'version'])
export class ApplicationRevisionEntity extends BaseEntity {
  @Column({ name: 'application_id' }) applicationId: number;
  @Column() version: number;
  @Column({ name: 'created_by_user_id' }) createdByUserId: number;
  @Column({ type: 'jsonb' }) snapshot: ApplicationSnapshot;
  @Column({ type: 'jsonb' }) policy: RegistrationPolicy;
}

@Entity('tournament_application_events')
export class ApplicationEventEntity extends BaseEntity {
  @Column({ name: 'application_id' }) applicationId: number;
  @Column({ name: 'revision_id' }) revisionId: number;
  @Column({ name: 'actor_user_id' }) actorUserId: number;
  @Column() action: string;
  @Column({ type: 'text', nullable: true }) comment: string | null;
}

@Entity('tournament_roster_players')
@Index('UQ_tournament_roster_active_player', ['tournamentId', 'playerId'], {
  unique: true,
  where: '"isActive" = true',
})
export class TournamentRosterPlayerEntity extends BaseEntity {
  @Column({ name: 'tournament_id' }) tournamentId: number;
  @Column({ name: 'tournament_team_id' }) tournamentTeamId: number;
  @Column({ name: 'team_id' }) teamId: number;
  @Column({ name: 'player_id' }) playerId: number;
  @Column({ name: 'team_player_id' }) teamPlayerId: number;
  @Column({ name: 'revision_id' }) revisionId: number;
  @Column({ type: 'int', nullable: true }) shirtNumber?: number;
  @Column({ type: 'varchar', nullable: true }) position?: PlayerPosition;
  @Column() isCaptain: boolean;
  @Column({ default: true }) isActive: boolean;
  @ManyToOne(() => PlayerEntity)
  @JoinColumn({ name: 'player_id' })
  player: PlayerEntity;
}

@Entity('community_transfer_requests')
@Index(
  'UQ_community_transfer_pending',
  ['communityId', 'playerId', 'toTeamId'],
  { unique: true, where: "status = 'pending'" },
)
export class CommunityTransferRequestEntity extends BaseEntity {
  @Column({ name: 'community_id' }) communityId: number;
  @Column({ name: 'player_id' }) playerId: number;
  @Column({ name: 'from_team_id', type: 'int', nullable: true }) fromTeamId:
    | number
    | null;
  @Column({ name: 'to_team_id' }) toTeamId: number;
  @Column({ name: 'requested_by_user_id' }) requestedByUserId: number;
  @Column({ type: 'int' }) shirtNumber: number;
  @Column({ default: 'pending' }) status: string;
  @Column({ name: 'reviewed_by_user_id', type: 'int', nullable: true })
  reviewedByUserId: number | null;
  @Column({ type: 'text', nullable: true }) comment: string | null;
  @ManyToOne(() => PlayerEntity)
  @JoinColumn({ name: 'player_id' })
  player: PlayerEntity;
  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'to_team_id' })
  toTeam: TeamEntity;
  @ManyToOne(() => TeamEntity)
  @JoinColumn({ name: 'from_team_id' })
  fromTeam: TeamEntity;
}
