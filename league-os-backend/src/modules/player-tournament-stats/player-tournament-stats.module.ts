import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerTournamentStatEntity } from './entities/player-tournament-stat.entity';
import { PlayerTournamentStatsService } from './player-tournament-stats.service';
import { MatchEntity } from '../matches/entities/match.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlayerTournamentStatEntity, MatchEntity]),
  ],
  exports: [PlayerTournamentStatsService],
  providers: [PlayerTournamentStatsService],
})
export class PlayerTournamentStatsModule {}
