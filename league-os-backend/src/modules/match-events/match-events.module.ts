import { Module } from '@nestjs/common';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {MatchEventEntity} from "./entities/match-event.entity";

@Module({
  imports: [TypeOrmModule.forFeature([MatchEventEntity])],
  controllers: [MatchEventsController],
  providers: [MatchEventsService]
})
export class MatchEventsModule {}
