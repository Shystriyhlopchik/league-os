import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TournamentGroupEntity } from './entities/tournament-group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TournamentGroupEntity])],
  exports: [TypeOrmModule],
})
export class TournamentGroupsModule {}
