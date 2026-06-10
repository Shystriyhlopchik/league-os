import { Module } from '@nestjs/common';
import { MatchServiceController } from './match-service.controller';
import { MatchServiceService } from './match-service.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchEntity } from '../matches/entities/match.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { PlayerTournamentStatEntity } from '../player-tournament-stats/entities/player-tournament-stat.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchEntity,
      TeamPlayerEntity,
      PlayerTournamentStatEntity,
      MatchRosterEntity,
      MatchRosterPlayerEntity,
    ]),
  ],
  controllers: [MatchServiceController],
  providers: [MatchServiceService],
})
export class MatchServiceModule {}
