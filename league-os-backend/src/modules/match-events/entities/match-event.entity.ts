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

    @Column({ name: 'assist_player_id', nullable: true })
    assistPlayerId?: number;

    @ManyToOne(() => PlayerEntity, { nullable: true })
    @JoinColumn({ name: 'assist_player_id' })
    assistPlayer?: PlayerEntity;

    @Column({ name: 'secondary_player_id', nullable: true })
    secondaryPlayerId?: number;

    @ManyToOne(() => PlayerEntity, { nullable: true })
    @JoinColumn({ name: 'secondary_player_id' })
    secondaryPlayer?: PlayerEntity;

    @Column({ name: 'half', nullable: true })
    half?: number;

    @Column({ name: 'second', nullable: true })
    second?: number;

    @Column({ name: 'client_event_id', unique: true, nullable: true })
    clientEventId?: string;

    @Column({ name: 'is_cancelled', default: false })
    isCancelled: boolean;
}