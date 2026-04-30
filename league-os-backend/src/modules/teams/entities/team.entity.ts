import {
    Column,
    Entity, OneToMany,
} from 'typeorm';
import {BaseEntity} from "../../../common/base/base.entity";
import {TeamPlayerEntity} from "../../team-players/entities/team-players.entity";
import {TournamentTeamEntity} from "../../tournament-teams/entities/tournament-teams.entity";
import {MatchEventEntity} from "../../match-events/entities/match-event.entity";
import {StandingEntity} from "../../standings/entities/standing.entity";


@Entity('teams')
export class TeamEntity extends BaseEntity {
    @Column()
    name: string;

    @Column({ nullable: true })
    shortName?: string;

    @Column({ unique: true })
    slug: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ nullable: true })
    logoUrl?: string;

    @Column({ length: 7, nullable: true })
    primaryColor?: string;

    @Column({ length: 7, nullable: true })
    secondaryColor?: string;

    @Column({ nullable: true })
    city?: string;

    @Column({ nullable: true })
    village?: string;

    @Column({ nullable: true })
    foundedYear?: number;

    @Column({ default: true })
    isActive: boolean;

    @OneToMany(() => TournamentTeamEntity, (tournamentTeam) => tournamentTeam.team)
    tournamentTeams: TournamentTeamEntity[];

    @OneToMany(() => TeamPlayerEntity, (teamPlayer) => teamPlayer.team)
    teamPlayers: TeamPlayerEntity[];

    @OneToMany(() => MatchEventEntity, (event) => event.team)
    matchEvents: MatchEventEntity[];

    @OneToMany(() => StandingEntity, (standing) => standing.team)
    standings: StandingEntity[];
}