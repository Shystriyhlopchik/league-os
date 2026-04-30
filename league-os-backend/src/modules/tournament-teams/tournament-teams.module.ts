import { Module } from '@nestjs/common';
import { TournamentTeamsController } from './tournament-teams.controller';
import { TournamentTeamsService } from './tournament-teams.service';

@Module({
  controllers: [TournamentTeamsController],
  providers: [TournamentTeamsService]
})
export class TournamentTeamsModule {}
