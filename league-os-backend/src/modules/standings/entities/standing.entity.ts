import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
} from 'typeorm';

import { TournamentEntity } from '../../tournaments/entities/tournaments.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import {BaseEntity} from "../../../common/base/base.entity";

@Entity('standings')
export class StandingEntity extends BaseEntity{
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
}