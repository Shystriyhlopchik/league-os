import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlayerSuspensionsModule } from '../player-suspensions/player-suspensions.module';
import { TournamentDecisionEntity } from './entities/tournament-decision.entity';
import { TournamentDecisionsService } from './tournament-decisions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TournamentDecisionEntity]),
    PlayerSuspensionsModule,
  ],
  providers: [TournamentDecisionsService],
  exports: [TournamentDecisionsService],
})
export class TournamentDecisionsModule {}
