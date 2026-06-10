import { Module } from '@nestjs/common';
import { MatchServiceController } from './match-service.controller';
import { MatchServiceService } from './match-service.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {MatchEntity} from "../matches/entities/match.entity";

@Module({
  imports: [TypeOrmModule.forFeature([MatchEntity])],
  controllers: [MatchServiceController],
  providers: [MatchServiceService]
})
export class MatchServiceModule {}
