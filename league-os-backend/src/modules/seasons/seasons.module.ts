import { Module } from '@nestjs/common';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeasonEntity } from './entities/season.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SeasonEntity])],
  controllers: [SeasonsController],
  providers: [SeasonsService],
})
export class SeasonsModule {}
