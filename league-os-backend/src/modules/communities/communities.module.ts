import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { CommunityEntity } from './entities/community.entity';
import { CommunityMemberEntity } from './entities/community-member.entity';
import { CommunityAccessAuditEntity } from './entities/community-access-audit.entity';
import { CompetitionEntity } from '../competitions/entities/competitions.entity';
import { SeasonEntity } from '../seasons/entities/season.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { UserEntity } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityEntity,
      CommunityMemberEntity,
      CommunityAccessAuditEntity,
      CompetitionEntity,
      SeasonEntity,
      TournamentEntity,
      TournamentMemberEntity,
      UserEntity,
    ]),
  ],
  controllers: [CommunitiesController],
  providers: [CommunitiesService],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
