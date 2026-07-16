import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TournamentsService } from './tournaments.service';
import { TournamentAccessAction } from './access/tournament-access-action.enum';
import { RequireTournamentAccess } from './access/tournament-access.decorator';
import { TournamentAccessGuard } from './access/tournament-access.guard';
import { CreateGroupRequestDto } from './dto/create-group-request.dto';
import { CreateRuleVersionRequestDto } from './dto/create-rule-version-request.dto';
import { CreateStageParticipantRequestDto } from './dto/create-stage-participant-request.dto';
import { CreateStageRequestDto } from './dto/create-stage-request.dto';
import { CreateUserTournamentDto } from './dto/create-user-tournament.dto';
import { ManageTournamentMemberDto } from './dto/manage-tournament-member.dto';
import { PreviewTournamentDto } from './dto/preview-tournament.dto';
import { PublishTournamentDto } from './dto/publish-tournament.dto';
import { UpdateGroupRequestDto } from './dto/update-group-request.dto';
import { UpdateStageParticipantRequestDto } from './dto/update-stage-participant-request.dto';
import { UpdateStageRequestDto } from './dto/update-stage-request.dto';
import { UpdateUserTournamentDto } from './dto/update-user-tournament.dto';
import { TournamentLifecycleService } from './tournament-lifecycle.service';
import type { AuthenticatedTournamentRequest } from './types/authenticated-tournament-request.type';
import { AssignStageGroupsDto } from './dto/assign-stage-groups.dto';
import { PreviewGroupStageScheduleDto } from './dto/preview-group-stage-schedule.dto';
import { GenerateGroupStageScheduleDto } from './dto/generate-group-stage-schedule.dto';
import { TournamentGroupSchedulingService } from './scheduling/tournament-group-scheduling.service';
import { QualificationService } from '../tournament-qualifications/qualification.service';
import { PreviewQualificationDto } from './dto/preview-qualification.dto';
import { ConfirmQualificationDto } from './dto/confirm-qualification.dto';
import { RecalculateQualificationDto } from './dto/recalculate-qualification.dto';
import { KnockoutBracketService } from '../tournament-knockout-brackets/knockout-bracket.service';
import { PreviewKnockoutBracketDto } from './dto/preview-knockout-bracket.dto';
import { ConfirmKnockoutBracketDto } from './dto/confirm-knockout-bracket.dto';
import { AdvanceKnockoutMatchDto } from './dto/advance-knockout-match.dto';
import { PlayerSuspensionsService } from '../player-suspensions/player-suspensions.service';
import { ExtendPlayerSuspensionDto } from '../player-suspensions/dto/extend-player-suspension.dto';
import { AddTournamentTeamDto } from './dto/add-tournament-team.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode } from '../users/enums/role-code.enum';
import { FeatureFlag } from '../../common/feature-flags/feature-flag.enum';
import { FeatureFlagGuard } from '../../common/feature-flags/feature-flag.guard';
import { RequireFeature } from '../../common/feature-flags/require-feature.decorator';

@Controller('tournaments')
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly lifecycleService: TournamentLifecycleService,
    private readonly groupSchedulingService: TournamentGroupSchedulingService,
    private readonly qualificationService: QualificationService,
    private readonly knockoutBracketService: KnockoutBracketService,
    private readonly playerSuspensionsService: PlayerSuspensionsService,
  ) {}

  @Post(':tournamentId/discipline/suspensions/:suspensionId/extend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  extendPlayerSuspension(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('suspensionId', ParseIntPipe) suspensionId: number,
    @Body() dto: ExtendPlayerSuspensionDto,
  ) {
    return this.playerSuspensionsService.extend(
      tournamentId,
      suspensionId,
      dto.extraMatches,
      dto.manualDecisionId,
    );
  }

  @Get(':tournamentId/discipline/suspensions/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleCode.SuperAdmin,
    RoleCode.Admin,
    RoleCode.Referee,
    RoleCode.Captain,
  )
  getActivePlayerSuspensions(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
  ) {
    return this.playerSuspensionsService.listActiveForTournament(tournamentId);
  }

  @Post()
  @UseGuards(FeatureFlagGuard, JwtAuthGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  create(
    @Body() dto: CreateUserTournamentDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.lifecycleService.create(dto, request.user.id);
  }

  @Get(':tournamentId/builder')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.READ)
  getBuilderDraft(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
  ) {
    return this.lifecycleService.getBuilderDraft(tournamentId);
  }

  @Post(':tournamentId/teams')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  addTournamentTeam(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: AddTournamentTeamDto,
  ) {
    return this.lifecycleService.addTournamentTeam(tournamentId, dto.teamId);
  }

  @Post(':tournamentId/stages/:stageId/knockout-bracket/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  previewKnockoutBracket(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: PreviewKnockoutBracketDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.knockoutBracketService.preview(
      tournamentId,
      stageId,
      dto,
      request.user.id,
    );
  }

  @Post(':tournamentId/knockout-bracket-snapshots/:snapshotId/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  confirmKnockoutBracket(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
    @Body() dto: ConfirmKnockoutBracketDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.knockoutBracketService.confirm(
      tournamentId,
      snapshotId,
      dto,
      request.user.id,
    );
  }

  @Get(':tournamentId/stages/:stageId/knockout-bracket/current')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.READ)
  getCurrentKnockoutBracket(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
  ) {
    return this.knockoutBracketService.getCurrent(tournamentId, stageId);
  }

  @Post(':tournamentId/knockout/matches/:matchId/advance')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  advanceKnockoutMatch(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: AdvanceKnockoutMatchDto,
  ) {
    return this.knockoutBracketService.advance(
      tournamentId,
      matchId,
      dto.winnerTeamId,
    );
  }

  @Post(
    ':tournamentId/transitions/:fromStageId/:toStageId/qualification/preview',
  )
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  previewQualification(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('fromStageId', ParseIntPipe) fromStageId: number,
    @Param('toStageId', ParseIntPipe) toStageId: number,
    @Body() dto: PreviewQualificationDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.qualificationService.preview(
      tournamentId,
      fromStageId,
      toStageId,
      dto,
      request.user.id,
    );
  }

  @Post(':tournamentId/qualification-snapshots/:snapshotId/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  confirmQualification(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
    @Body() dto: ConfirmQualificationDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.qualificationService.confirm(
      tournamentId,
      snapshotId,
      dto,
      request.user.id,
    );
  }

  @Post(':tournamentId/qualification-snapshots/:snapshotId/recalculate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  recalculateQualification(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
    @Body() dto: RecalculateQualificationDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.qualificationService.recalculate(
      tournamentId,
      snapshotId,
      dto,
      request.user.id,
    );
  }

  @Get(
    ':tournamentId/transitions/:fromStageId/:toStageId/qualification/current',
  )
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.READ)
  getCurrentQualification(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('fromStageId', ParseIntPipe) fromStageId: number,
    @Param('toStageId', ParseIntPipe) toStageId: number,
  ) {
    return this.qualificationService.getCurrent(
      tournamentId,
      fromStageId,
      toStageId,
    );
  }

  @Patch(':tournamentId')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  update(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: UpdateUserTournamentDto,
  ) {
    return this.lifecycleService.update(tournamentId, dto);
  }

  @Post(':tournamentId/members')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.MANAGE_MEMBERS)
  setMember(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: ManageTournamentMemberDto,
  ) {
    return this.lifecycleService.setMember(tournamentId, dto);
  }

  @Delete(':tournamentId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.MANAGE_MEMBERS)
  removeMember(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.lifecycleService.removeMember(tournamentId, userId);
  }

  @Post(':tournamentId/stages')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  createStage(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: CreateStageRequestDto,
  ) {
    return this.lifecycleService.createStage(tournamentId, dto);
  }

  @Patch(':tournamentId/stages/:stageId')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  updateStage(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: UpdateStageRequestDto,
  ) {
    return this.lifecycleService.updateStage(tournamentId, stageId, dto);
  }

  @Delete(':tournamentId/stages/:stageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  removeStage(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
  ) {
    return this.lifecycleService.removeStage(tournamentId, stageId);
  }

  @Post(':tournamentId/stages/:stageId/groups')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  createGroup(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: CreateGroupRequestDto,
  ) {
    return this.lifecycleService.createGroup(tournamentId, stageId, dto);
  }

  @Patch(':tournamentId/stages/:stageId/groups/:groupId')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  updateGroup(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: UpdateGroupRequestDto,
  ) {
    return this.lifecycleService.updateGroup(
      tournamentId,
      stageId,
      groupId,
      dto,
    );
  }

  @Delete(':tournamentId/stages/:stageId/groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  removeGroup(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    return this.lifecycleService.removeGroup(tournamentId, stageId, groupId);
  }

  @Post(':tournamentId/stages/:stageId/participants')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  addStageParticipant(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: CreateStageParticipantRequestDto,
  ) {
    return this.lifecycleService.addStageParticipant(
      tournamentId,
      stageId,
      dto,
    );
  }

  @Patch(':tournamentId/stages/:stageId/participants/:participantId')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  updateStageParticipant(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Param('participantId', ParseIntPipe) participantId: number,
    @Body() dto: UpdateStageParticipantRequestDto,
  ) {
    return this.lifecycleService.updateStageParticipant(
      tournamentId,
      stageId,
      participantId,
      dto,
    );
  }

  @Delete(':tournamentId/stages/:stageId/participants/:participantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  removeStageParticipant(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Param('participantId', ParseIntPipe) participantId: number,
  ) {
    return this.lifecycleService.removeStageParticipant(
      tournamentId,
      stageId,
      participantId,
    );
  }

  @Post(':tournamentId/stages/:stageId/group-assignments/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  previewGroupAssignments(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: AssignStageGroupsDto,
  ) {
    return this.groupSchedulingService.previewGroupAssignments(
      tournamentId,
      stageId,
      dto,
    );
  }

  @Put(':tournamentId/stages/:stageId/group-assignments')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  assignGroups(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: AssignStageGroupsDto,
  ) {
    return this.groupSchedulingService.assignGroups(tournamentId, stageId, dto);
  }

  @Post(':tournamentId/stages/:stageId/schedule/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  previewGroupStageSchedule(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: PreviewGroupStageScheduleDto,
  ) {
    return this.groupSchedulingService.previewSchedule(
      tournamentId,
      stageId,
      dto,
    );
  }

  @Post(':tournamentId/stages/:stageId/schedule/generate')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  generateGroupStageSchedule(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: GenerateGroupStageScheduleDto,
  ) {
    return this.groupSchedulingService.generateSchedule(
      tournamentId,
      stageId,
      dto,
    );
  }

  @Post(':tournamentId/rule-versions')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  createRuleVersion(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: CreateRuleVersionRequestDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.lifecycleService.createRuleVersion(
      tournamentId,
      dto,
      request.user.id,
    );
  }

  @Get(':tournamentId/rule-versions')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.READ)
  getRuleVersions(@Param('tournamentId', ParseIntPipe) tournamentId: number) {
    return this.lifecycleService.getRuleVersions(tournamentId);
  }

  @Patch(':tournamentId/rule-versions/:ruleVersionId')
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  updateDraftRuleVersion(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('ruleVersionId', ParseIntPipe) ruleVersionId: number,
    @Body() dto: CreateRuleVersionRequestDto,
  ) {
    return this.lifecycleService.updateDraftRuleVersion(
      tournamentId,
      ruleVersionId,
      dto,
    );
  }

  @Post(':tournamentId/validate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  preview(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: PreviewTournamentDto,
  ) {
    return this.lifecycleService.preview(tournamentId, dto);
  }

  @Post(':tournamentId/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.PUBLISH)
  publish(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: PublishTournamentDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.lifecycleService.publish(
      tournamentId,
      dto.ruleVersionId,
      request.user.id,
    );
  }

  @Post(':tournamentId/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureFlagGuard, JwtAuthGuard, TournamentAccessGuard)
  @RequireFeature(FeatureFlag.TournamentBuilder)
  @RequireTournamentAccess(TournamentAccessAction.PUBLISH)
  complete(@Param('tournamentId', ParseIntPipe) tournamentId: number) {
    return this.lifecycleService.complete(tournamentId);
  }

  @Get('season/:seasonId')
  getBySeason(@Param('seasonId', ParseIntPipe) seasonId: number) {
    return this.tournamentsService.findBySeason(seasonId);
  }

  @Get(':tournamentId/stats-summary')
  getStatsSummary(@Param('tournamentId', ParseIntPipe) tournamentId: number) {
    return this.tournamentsService.getStatsSummary(tournamentId);
  }
}
