import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {PlayerEntity} from "./entities/player.entity";

@Module({
  imports: [TypeOrmModule.forFeature([PlayerEntity])],
  controllers: [PlayersController],
  providers: [PlayersService]
})
export class PlayersModule {}
