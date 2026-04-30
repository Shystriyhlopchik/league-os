import { Module } from '@nestjs/common';
import { TeamPlayersController } from './team-players.controller';
import { TeamPlayersService } from './team-players.service';

@Module({
  controllers: [TeamPlayersController],
  providers: [TeamPlayersService]
})
export class TeamPlayersModule {}
