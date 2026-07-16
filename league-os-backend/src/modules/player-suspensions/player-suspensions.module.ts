import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { DisciplineEngine } from './discipline.engine';
import { PlayerSuspensionEntity } from './entities/player-suspension.entity';
import { PlayerSuspensionsService } from './player-suspensions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlayerSuspensionEntity,
      MatchEntity,
      MatchEventEntity,
      TournamentStageEntity,
      TournamentEntity,
      TournamentRuleVersionEntity,
    ]),
  ],
  providers: [DisciplineEngine, PlayerSuspensionsService],
  exports: [DisciplineEngine, PlayerSuspensionsService],
})
export class PlayerSuspensionsModule {}
