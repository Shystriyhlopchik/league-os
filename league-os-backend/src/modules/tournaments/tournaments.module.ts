import { Module } from '@nestjs/common';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {TournamentEntity} from "./entities/tournaments.entity";

@Module({
  imports: [TypeOrmModule.forFeature([TournamentEntity])],
  controllers: [TournamentsController],
  providers: [TournamentsService]
})
export class TournamentsModule {}
