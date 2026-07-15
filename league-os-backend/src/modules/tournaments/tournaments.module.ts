import { Module } from '@nestjs/common';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TournamentEntity } from './entities/tournaments.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { AuthModule } from '../auth/auth.module';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { UserEntity } from '../users/entities/user.entity';
import { TournamentAccessGuard } from './access/tournament-access.guard';
import { TournamentAccessService } from './access/tournament-access.service';
import { TournamentLifecycleService } from './tournament-lifecycle.service';
import { TournamentConfigurationValidationService } from './validation/tournament-configuration-validation.service';
import { TournamentRulesConfigValidator } from './validation/tournament-rules-config.validator';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      TournamentEntity,
      MatchEntity,
      MatchEventEntity,
      TournamentStageEntity,
      TournamentGroupEntity,
      TournamentRuleVersionEntity,
      TournamentMemberEntity,
      TournamentStageParticipantEntity,
      TournamentTeamEntity,
      UserEntity,
    ]),
  ],
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    TournamentLifecycleService,
    TournamentAccessService,
    TournamentAccessGuard,
    TournamentRulesConfigValidator,
    TournamentConfigurationValidationService,
  ],
  exports: [TournamentLifecycleService],
})
export class TournamentsModule {}
