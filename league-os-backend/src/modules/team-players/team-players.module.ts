import { Module } from '@nestjs/common';
import { TeamPlayersController } from './team-players.controller';
import { TeamPlayersService } from './team-players.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamPlayerEntity } from './entities/team-players.entity';
import { TeamEntity } from '../teams/entities/team.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TeamPlayerEntity, TeamEntity, PlayerEntity]),
    UsersModule,
  ],
  controllers: [TeamPlayersController],
  providers: [TeamPlayersService],
  exports: [TeamPlayersService],
})
export class TeamPlayersModule {}
