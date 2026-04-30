import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
} from 'typeorm';

import { TeamEntity } from '../../teams/entities/team.entity';
import { PlayerEntity } from '../../players/entities/player.entity';
import { PlayerPosition } from '../../players/enums/player-position.enum';
import {BaseEntity} from "../../../common/base/base.entity";

@Entity('team_players')
export class TeamPlayerEntity extends BaseEntity {
    @Column({ name: 'team_id' })
    teamId: number;

    @Column({ name: 'player_id' })
    playerId: number;

    @ManyToOne(() => PlayerEntity, { nullable: false })
    @JoinColumn({ name: 'player_id' })
    player: PlayerEntity;

    @Column({ nullable: true })
    shirtNumber?: number;

    @Column({
        type: 'enum',
        enum: PlayerPosition,
        nullable: true,
    })
    position?: PlayerPosition;

    @Column({ default: false })
    isCaptain: boolean;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'date', nullable: true })
    joinedAt?: string;

    @Column({ type: 'date', nullable: true })
    leftAt?: string;

    @ManyToOne(() => TeamEntity, { nullable: false })
    @JoinColumn({ name: 'team_id' })
    team: TeamEntity;
}