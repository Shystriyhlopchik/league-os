import { Module } from '@nestjs/common';
import { TeamPlayersController } from './team-players.controller';
import { TeamPlayersService } from './team-players.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {TeamPlayerEntity} from "./entities/team-players.entity";

@Module({
  imports: [TypeOrmModule.forFeature([TeamPlayerEntity])],
  controllers: [TeamPlayersController],
  providers: [TeamPlayersService]
})
export class TeamPlayersModule {}
