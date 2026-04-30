import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StandingsController } from './standings.controller';
import { StandingsService } from './standings.service';
import { StandingEntity } from './entities/standing.entity';
import {MatchEntity} from "../matches/entities/match.entity";


@Module({
  imports: [TypeOrmModule.forFeature([StandingEntity, MatchEntity,])],
  controllers: [StandingsController],
  providers: [StandingsService],
  exports: [StandingsService],
})
export class StandingsModule {}