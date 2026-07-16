import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerTournamentStatEntity } from './entities/player-tournament-stat.entity';
import { PlayerTournamentStatsService } from './player-tournament-stats.service';
import { MatchEntity } from '../matches/entities/match.entity';
import { PlayerSuspensionsModule } from '../player-suspensions/player-suspensions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlayerTournamentStatEntity, MatchEntity]),
    PlayerSuspensionsModule,
  ],
  exports: [PlayerTournamentStatsService],
  providers: [PlayerTournamentStatsService],
})
export class PlayerTournamentStatsModule {}
