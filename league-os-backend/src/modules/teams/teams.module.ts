import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamEntity } from './entities/team.entity';
import { TeamPlayersModule } from '../team-players/team-players.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { CommunitiesModule } from '../communities/communities.module';
import { AuthModule } from '../auth/auth.module';
import { TeamWorkspaceController } from './team-workspace.controller';
import { TeamWorkspaceService } from './team-workspace.service';
import {
  TeamManagerEntity,
  TeamAccessRequestEntity,
  TeamManagementAuditEntity,
} from './entities/team-management.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TeamEntity,
      TeamManagerEntity,
      TeamAccessRequestEntity,
      TeamManagementAuditEntity,
    ]),
    TeamPlayersModule,
    RegistrationsModule,
    CommunitiesModule,
    AuthModule,
  ],
  controllers: [TeamsController, TeamWorkspaceController],
  providers: [TeamsService, TeamWorkspaceService],
  exports: [TeamsService],
})
export class TeamsModule {}
