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
import { GroupAssignmentStrategyService } from './scheduling/group-assignment-strategy.service';
import { RoundRobinGenerator } from './scheduling/round-robin-generator';
import { TournamentGroupSchedulingService } from './scheduling/tournament-group-scheduling.service';
import { StandingEntity } from '../standings/entities/standing.entity';
import { QualificationSnapshotEntity } from '../tournament-qualifications/entities/qualification-snapshot.entity';
import { QualificationSnapshotEntryEntity } from '../tournament-qualifications/entities/qualification-snapshot-entry.entity';
import { QualificationEngine } from '../tournament-qualifications/qualification.engine';
import { QualificationService } from '../tournament-qualifications/qualification.service';
import { KnockoutBracketSnapshotEntity } from '../tournament-knockout-brackets/entities/knockout-bracket-snapshot.entity';
import { KnockoutBracketPlanEntity } from '../tournament-knockout-brackets/entities/knockout-bracket-plan.entity';
import { KnockoutBracketEngine } from '../tournament-knockout-brackets/knockout-bracket.engine';
import { KnockoutBracketService } from '../tournament-knockout-brackets/knockout-bracket.service';
import { PlayerSuspensionsModule } from '../player-suspensions/player-suspensions.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { StandingsModule } from '../standings/standings.module';
import { VenueEntity } from '../venues/entities/venue.entity';
import { PlayoffLaunchService } from './playoff-launch.service';

@Module({
  imports: [
    AuthModule,
    PlayerSuspensionsModule,
    StandingsModule,
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
      StandingEntity,
      QualificationSnapshotEntity,
      QualificationSnapshotEntryEntity,
      KnockoutBracketSnapshotEntity,
      KnockoutBracketPlanEntity,
      MatchRosterPlayerEntity,
      VenueEntity,
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
    GroupAssignmentStrategyService,
    RoundRobinGenerator,
    TournamentGroupSchedulingService,
    QualificationEngine,
    QualificationService,
    KnockoutBracketEngine,
    KnockoutBracketService,
    PlayoffLaunchService,
    RolesGuard,
  ],
  exports: [TournamentLifecycleService, KnockoutBracketService],
})
export class TournamentsModule {}
