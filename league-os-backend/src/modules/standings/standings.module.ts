import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StandingsController } from './standings.controller';
import { StandingsService } from './standings.service';
import { StandingEntity } from './entities/standing.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { RuleDrivenStandingsEngine } from './rule-driven-standings.engine';
import { QualificationSnapshotEntity } from '../tournament-qualifications/entities/qualification-snapshot.entity';
import { QualificationSnapshotEntryEntity } from '../tournament-qualifications/entities/qualification-snapshot-entry.entity';
import { KnockoutBracketSnapshotEntity } from '../tournament-knockout-brackets/entities/knockout-bracket-snapshot.entity';
import { KnockoutBracketPlanEntity } from '../tournament-knockout-brackets/entities/knockout-bracket-plan.entity';
import { MatchServiceSessionEntity } from '../match-service/entities/match-service-session.entity';
import { TournamentAccessGuard } from '../tournaments/access/tournament-access.guard';
import { TournamentAccessService } from '../tournaments/access/tournament-access.service';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { CommunityMemberEntity } from '../communities/entities/community-member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StandingEntity,
      MatchEntity,
      MatchServiceSessionEntity,
      TournamentMemberEntity,
      CommunityMemberEntity,
      MatchEventEntity,
      TournamentStageEntity,
      TournamentGroupEntity,
      TournamentStageParticipantEntity,
      TournamentTeamEntity,
      TournamentEntity,
      TournamentRuleVersionEntity,
      QualificationSnapshotEntity,
      QualificationSnapshotEntryEntity,
      KnockoutBracketSnapshotEntity,
      KnockoutBracketPlanEntity,
    ]),
  ],
  controllers: [StandingsController],
  providers: [StandingsService, RuleDrivenStandingsEngine, TournamentAccessService, TournamentAccessGuard],
  exports: [StandingsService],
})
export class StandingsModule {}
