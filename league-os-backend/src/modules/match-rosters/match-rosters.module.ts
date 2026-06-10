import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchRosterEntity } from './entities/match-roster.entity';
import { MatchRosterPlayerEntity } from './entities/match-roster-player.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchRosterEntity, MatchRosterPlayerEntity]),
  ],
  exports: [TypeOrmModule],
})
export class MatchRostersModule {}
