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
import { RegistrationsModule } from '../registrations/registrations.module';
import { CommunitiesModule } from '../communities/communities.module';
import { PlayerProfilesController } from './player-profiles.controller';
import { PlayerProfilesService } from './player-profiles.service';
import {
  PlayerProfileChangeEntity,
  PlayerProfileAuditEntity,
} from './entities/player-profile-change.entity';

@Module({
  imports: [
    RegistrationsModule,
    CommunitiesModule,
    TypeOrmModule.forFeature([
      PlayerProfileChangeEntity,
      PlayerProfileAuditEntity,
      PlayerEntity,
      MatchEntity,
      MatchEventEntity,
      MatchRosterPlayerEntity,
      PlayerTournamentStatEntity,
      TournamentEntity,
    ]),
  ],
  controllers: [PlayersController, PlayerProfilesController],
  providers: [PlayersService, PlayerProfilesService],
})
export class PlayersModule {}
