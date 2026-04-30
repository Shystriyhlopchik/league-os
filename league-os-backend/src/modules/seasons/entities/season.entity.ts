import {
    Column,
    Entity,
    ManyToOne,
    JoinColumn, OneToMany,
} from 'typeorm';
import { BaseEntity } from "../../../common/base/base.entity";
import { CompetitionEntity } from "../../competitions/entities/competitions.entity";
import {TournamentEntity} from "../../tournaments/entities/tournaments.entity";


@Entity('seasons')
export class SeasonEntity extends BaseEntity {
    @Column({ name: 'competition_id' })
    competitionId: number;

    @ManyToOne(() => CompetitionEntity, { nullable: false })
    @JoinColumn({ name: 'competition_id' })
    competition: CompetitionEntity;

    @Column()
    name: string;

    @Column()
    slug: string;

    @Column({ nullable: true })
    year?: number;

    @Column({ type: 'date', nullable: true })
    startDate?: string;

    @Column({ type: 'date', nullable: true })
    endDate?: string;

    @Column({ default: 'planned' })
    status: string;

    @Column({ default: true })
    isActive: boolean;

    @OneToMany(() => SeasonEntity, (season) => season.competition)
    seasons: SeasonEntity[];

    @OneToMany(() => TournamentEntity, (tournament) => tournament.season)
    tournaments: TournamentEntity[];
}