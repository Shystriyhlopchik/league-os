import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchEntity } from './entities/match.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchEntity,
      MatchRosterEntity,
      MatchRosterPlayerEntity,
    ]),
  ],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
