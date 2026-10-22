import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { CommunityEntity } from '../communities/entities/community.entity';
import { CommunityMemberEntity } from '../communities/entities/community-member.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { TournamentAccessService } from '../tournaments/access/tournament-access.service';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { CommunitySquadsService } from './community-squads.service';
import { TournamentApplicationsService } from './tournament-applications.service';
import { RegistrationsController } from './registrations.controller';
import { TeamManagerEntity } from '../teams/entities/team-management.entity';
import {
  ApplicationEventEntity,
  ApplicationRevisionEntity,
  CommunityTeamEntity,
  CommunityTransferRequestEntity,
  TournamentApplicationEntity,
  TournamentRosterPlayerEntity,
} from './entities/registration.entity';

@Module({
  imports: [
    AuthModule,
    CommunitiesModule,
    TypeOrmModule.forFeature([
      CommunityEntity,
      CommunityMemberEntity,
      TournamentEntity,
      TournamentMemberEntity,
      TeamPlayerEntity,
      TeamManagerEntity,
      PlayerEntity,
      TournamentTeamEntity,
      CommunityTeamEntity,
      CommunityTransferRequestEntity,
      TournamentApplicationEntity,
      ApplicationRevisionEntity,
      ApplicationEventEntity,
      TournamentRosterPlayerEntity,
    ]),
  ],
  controllers: [RegistrationsController],
  providers: [
    CommunitySquadsService,
    TournamentApplicationsService,
    TournamentAccessService,
  ],
  exports: [CommunitySquadsService, TournamentApplicationsService],
})
export class RegistrationsModule {}
