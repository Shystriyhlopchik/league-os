import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetitionEntity } from '../competitions/entities/competitions.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { SeasonEntity } from '../seasons/entities/season.entity';
import { StandingEntity } from '../standings/entities/standing.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TeamRankingCalculator } from './team-ranking.calculator';
import { TeamRankingsController } from './team-rankings.controller';
import { TeamRankingsService } from './team-rankings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompetitionEntity,
      SeasonEntity,
      TournamentEntity,
      TournamentTeamEntity,
      MatchEntity,
      StandingEntity,
    ]),
  ],
  controllers: [TeamRankingsController],
  providers: [TeamRankingsService, TeamRankingCalculator],
})
export class TeamRankingsModule {}
