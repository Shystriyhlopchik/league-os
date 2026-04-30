import {
    Column,
    CreateDateColumn,
    Entity, OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import {BaseEntity} from "../../../common/base/base.entity";
import {PlayerPosition} from "../enums/player-position.enum";
import {PreferredFoot} from "../enums/preferred-foot.enum";
import {MatchEventEntity} from "../../match-events/entities/match-event.entity";

@Entity('players')
export class PlayerEntity extends BaseEntity {
    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column({ nullable: true })
    middleName?: string;

    @Column({ unique: true })
    slug: string;

    @Column({ type: 'date', nullable: true })
    birthDate?: string;

    @Column({ nullable: true })
    photoUrl?: string;

    @Column({
        type: 'enum',
        nullable: true,
        enum: PreferredFoot,
    })
    preferredFoot?: PreferredFoot;

    @Column({
        type: 'enum',
        enum: PlayerPosition,
        nullable: true,
    })
    position?: PlayerPosition;

    @Column({ default: true })
    isActive: boolean;

    @OneToMany(() => MatchEventEntity, (event) => event.player)
    matchEvents: MatchEventEntity[];
}