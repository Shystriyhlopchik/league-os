import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
} from 'typeorm';

import { BaseEntity } from '../../../common/base/base.entity';
import { MatchEntity } from '../../matches/entities/match.entity';
import { TeamEntity } from '../../teams/entities/team.entity';

export enum RedBallStatus {
    ACTIVE = 'active',
    COMPLETED_BY_GOAL = 'completed_by_goal',
    COMPLETED_BY_TIME = 'completed_by_time',
    CANCELLED = 'cancelled',
}

@Entity('match_red_ball_activations')
export class MatchRedBallActivationEntity extends BaseEntity {
    @Column({ name: 'match_id', type: 'int' })
    matchId: number;

    @ManyToOne(() => MatchEntity)
    @JoinColumn({ name: 'match_id' })
    match: MatchEntity;

    @Column({ name: 'team_id', type: 'int' })
    teamId: number;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team: TeamEntity;

    @Column({ name: 'activated_half', type: 'int' })
    activatedHalf: number;

    @Column({ name: 'activated_second', type: 'int' })
    activatedSecond: number;

    @Column({ name: 'duration_seconds', type: 'int', default: 120 })
    durationSeconds: number;

    @Column({
        type: 'enum',
        enum: RedBallStatus,
        enumName: 'red_ball_status_enum',
        default: RedBallStatus.ACTIVE,
    })
    status: RedBallStatus;

    @Column({ name: 'completed_half', type: 'int', nullable: true })
    completedHalf?: number | null;

    @Column({ name: 'completed_second', type: 'int', nullable: true })
    completedSecond?: number | null;

    @Column({ name: 'completed_by_event_id', type: 'int', nullable: true })
    completedByEventId?: number | null;
}