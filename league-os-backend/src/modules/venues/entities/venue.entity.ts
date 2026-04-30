import {
    Column,
    Entity, OneToMany,
} from 'typeorm';
import {MatchEntity} from "../../matches/entities/match.entity";
import {BaseEntity} from "../../../common/base/base.entity";

@Entity('venues')
export class VenueEntity extends BaseEntity{
    @Column()
    name: string;

    @Column({ unique: true })
    slug: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ nullable: true })
    address?: string;

    @Column({ nullable: true })
    city?: string;

    @Column({ nullable: true })
    village?: string;

    @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
    latitude?: string;

    @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
    longitude?: string;

    @Column({ default: true })
    isActive: boolean;

    @OneToMany(() => MatchEntity, (match) => match.venue)
    matches: MatchEntity[];
}