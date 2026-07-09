import { Module } from '@nestjs/common';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {TournamentEntity} from "./entities/tournaments.entity";
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TournamentEntity,
      MatchEntity,
      MatchEventEntity,
    ]),
  ],
  controllers: [TournamentsController],
  providers: [TournamentsService]
})
export class TournamentsModule {}
