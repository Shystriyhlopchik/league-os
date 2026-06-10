import { Module } from '@nestjs/common';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchEventEntity } from './entities/match-event.entity';
import { PlayerTournamentStatsModule } from '../player-tournament-stats/player-tournament-stats.module';
import { MatchEntity } from '../matches/entities/match.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchEventEntity, MatchEntity]),
    PlayerTournamentStatsModule,
  ],
  controllers: [MatchEventsController],
  providers: [MatchEventsService],
})
export class MatchEventsModule {}
