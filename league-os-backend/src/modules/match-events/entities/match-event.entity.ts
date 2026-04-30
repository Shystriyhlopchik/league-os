import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
} from 'typeorm';

import { MatchEntity } from '../../matches/entities/match.entity';
import { TeamEntity } from '../../teams/entities/team.entity';
import { PlayerEntity } from '../../players/entities/player.entity';
import { MatchEventType } from '../enums/match-event-type.enum';
import { BaseEntity } from "../../../common/base/base.entity";

@Entity('match_events')
export class MatchEventEntity extends BaseEntity {
    @Column({ name: 'match_id' })
    matchId: number;

    @ManyToOne(() => MatchEntity, { nullable: false })
    @JoinColumn({ name: 'match_id' })
    match: MatchEntity;

    @Column({ name: 'team_id' })
    teamId: number;

    @ManyToOne(() => TeamEntity, { nullable: false })
    @JoinColumn({ name: 'team_id' })
    team: TeamEntity;

    @Column({ name: 'player_id', nullable: true })
    playerId?: number;

    @ManyToOne(() => PlayerEntity, { nullable: true })
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({
        type: 'enum',
        enum: MatchEventType,
    })
    eventType: MatchEventType;

    @Column({ nullable: true })
    minute?: number;

    @Column({ nullable: true })
    addedMinute?: number;

    @Column({ type: 'text', nullable: true })
    description?: string;
}