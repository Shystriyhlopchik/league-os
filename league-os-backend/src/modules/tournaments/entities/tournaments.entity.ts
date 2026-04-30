import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne, OneToMany,
} from 'typeorm';
import { SeasonEntity } from '../../seasons/entities/season.entity';
import { BaseEntity } from "../../../common/base/base.entity";
import {TournamentStatus} from "../enums/tournament-status.enum";
import {TournamentFormat} from "../enums/tournament-format.enum";
import {TournamentType} from "../enums/tournament-type.enum";
import {TournamentTeamEntity} from "../../tournament-teams/entities/tournament-teams.entity";
import {StandingEntity} from "../../standings/entities/standing.entity";


@Entity('tournaments')
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

    @Column({ nullable: true })
    logoUrl?: string;

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => SeasonEntity, { nullable: false })
    @JoinColumn({ name: 'season_id' })
    season: SeasonEntity;

    @OneToMany(() => TournamentTeamEntity, (tournamentTeam) => tournamentTeam.tournament)
    tournamentTeams: TournamentTeamEntity[];

    @OneToMany(() => StandingEntity, (standing) => standing.tournament)
    standings: StandingEntity[];
}