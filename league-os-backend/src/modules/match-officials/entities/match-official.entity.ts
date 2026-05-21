import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
} from 'typeorm';

import { MatchEntity } from '../../matches/entities/match.entity';
import { MatchOfficialRole } from '../enums/match-official-role.enum';
import {BaseEntity} from "../../../common/base/base.entity";

@Entity('match_officials')
export class MatchOfficialEntity extends BaseEntity {
    @Column({ name: 'match_id' })
    matchId: number;

    @Column()
    fullName: string;

    @Column({
        type: 'enum',
        enum: MatchOfficialRole,
    })
    role: MatchOfficialRole;

    @ManyToOne(() => MatchEntity, { nullable: false })
    @JoinColumn({ name: 'match_id' })
    match: MatchEntity;
}