import { Module } from '@nestjs/common';
import { TournamentTeamsController } from './tournament-teams.controller';
import { TournamentTeamsService } from './tournament-teams.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {TournamentTeamEntity} from "./entities/tournament-teams.entity";

@Module({
  imports: [TypeOrmModule.forFeature([TournamentTeamEntity])],
  controllers: [TournamentTeamsController],
  providers: [TournamentTeamsService]
})
export class TournamentTeamsModule {}
