import { Module } from '@nestjs/common';
import { MatchServiceController } from './match-service.controller';
import { MatchServiceService } from './match-service.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchEntity } from '../matches/entities/match.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { PlayerTournamentStatEntity } from '../player-tournament-stats/entities/player-tournament-stat.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchServiceSessionEntity } from './entities/match-service-session.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { PlayerTournamentStatsModule } from '../player-tournament-stats/player-tournament-stats.module';
import { MatchRedBallActivationEntity } from './entities/match-red-ball-activation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchEntity,
      TeamPlayerEntity,
      PlayerTournamentStatEntity,
      MatchRosterEntity,
      MatchRosterPlayerEntity,
      MatchServiceSessionEntity,
      MatchEventEntity,
      MatchRedBallActivationEntity,
    ]),
    PlayerTournamentStatsModule,
  ],
  controllers: [MatchServiceController],
  providers: [MatchServiceService],
})
export class MatchServiceModule {}
