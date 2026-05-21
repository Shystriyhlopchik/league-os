import { Module } from '@nestjs/common';
import { MatchOfficialsController } from './match-officials.controller';
import { MatchOfficialsService } from './match-officials.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {MatchOfficialEntity} from "./entities/match-official.entity";

@Module({
  imports: [TypeOrmModule.forFeature([MatchOfficialEntity])],
  controllers: [MatchOfficialsController],
  providers: [MatchOfficialsService],
  exports: [MatchOfficialsService]
})
export class MatchOfficialsModule {}
