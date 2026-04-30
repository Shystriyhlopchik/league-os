import { Module } from '@nestjs/common';
import { CompetitionsController } from './competitions.controller';
import {CompetitionsService} from "./competitions.service";
import {TypeOrmModule} from "@nestjs/typeorm";
import {CompetitionEntity} from "./entities/competitions.entity";


@Module({
  imports: [TypeOrmModule.forFeature([CompetitionEntity])],
  controllers: [CompetitionsController],
  providers: [CompetitionsService],
  exports: [CompetitionsService]
})
export class CompetitionsModule {}
