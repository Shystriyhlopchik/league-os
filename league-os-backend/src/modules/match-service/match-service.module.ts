import { Module } from '@nestjs/common';
import { MatchServiceController } from './match-service.controller';
import { MatchServiceService } from './match-service.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchEntity } from '../matches/entities/match.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { PlayerTournamentStatEntity } from '../player-tournament-stats/entities/player-tournament-stat.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchEntity,
      TeamPlayerEntity,
      MatchEventEntity,
      PlayerTournamentStatEntity,
    ]),
  ],
  controllers: [MatchServiceController],
  providers: [MatchServiceService],
})
export class MatchServiceModule {}
