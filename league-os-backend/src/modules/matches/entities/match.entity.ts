import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { VenueEntity } from '../../venues/entities/venue.entity';
import { MatchStatus } from '../enums/match-status.enum';
import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEventEntity } from '../../match-events/entities/match-event.entity';
import { MatchOfficialEntity } from '../../match-officials/entities/match-official.entity';

@Entity('matches')
export class MatchEntity extends BaseEntity {
  @Column({ name: 'tournament_id' })
  tournamentId: number;

  @Column({ name: 'home_team_id' })
  homeTeamId: number;

  @Column({ name: 'away_team_id' })
  awayTeamId: number;

  @Column({ name: 'venue_id', nullable: true })
  venueId?: number;

  @Column({ type: 'timestamp', nullable: true })
  matchDatetime?: Date;

  @Column({ nullable: true })
  round?: string;

  @Column({
    type: 'enum',
    enum: MatchStatus,
    default: MatchStatus.SCHEDULED,
  })
  status: MatchStatus;

  @Column({ default: 0 })
  homeScore: number;

  @Column({ default: 0 })
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
