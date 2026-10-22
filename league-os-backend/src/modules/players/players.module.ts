import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerEntity } from './entities/player.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { PlayerTournamentStatEntity } from '../player-tournament-stats/entities/player-tournament-stat.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlayerEntity,
      MatchEntity,
      MatchEventEntity,
      MatchRosterPlayerEntity,
      PlayerTournamentStatEntity,
      TournamentEntity,
    ]),
  ],
  controllers: [PlayersController],
  providers: [PlayersService],
})
export class PlayersModule {}
