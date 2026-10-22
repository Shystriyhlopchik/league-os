import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TournamentStageEntity } from './entities/tournament-stage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TournamentStageEntity])],
  exports: [TypeOrmModule],
})
export class TournamentStagesModule {}
