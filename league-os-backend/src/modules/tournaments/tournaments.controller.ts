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

@Controller('tournaments')
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly lifecycleService: TournamentLifecycleService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() dto: CreateUserTournamentDto,
    @Req() request: AuthenticatedTournamentRequest,
  ) {
    return this.lifecycleService.create(dto, request.user.id);
  }

  @Patch(':tournamentId')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  update(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: UpdateUserTournamentDto,
  ) {
    return this.lifecycleService.update(tournamentId, dto);
  }

  @Post(':tournamentId/members')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.MANAGE_MEMBERS)
  setMember(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: ManageTournamentMemberDto,
  ) {
    return this.lifecycleService.setMember(tournamentId, dto);
  }

  @Delete(':tournamentId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.MANAGE_MEMBERS)
  removeMember(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.lifecycleService.removeMember(tournamentId, userId);
  }

  @Post(':tournamentId/stages')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  createStage(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: CreateStageRequestDto,
  ) {
    return this.lifecycleService.createStage(tournamentId, dto);
  }

  @Patch(':tournamentId/stages/:stageId')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  removeStage(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
  ) {
    return this.lifecycleService.removeStage(tournamentId, stageId);
  }

  @Post(':tournamentId/stages/:stageId/groups')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  createGroup(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: CreateGroupRequestDto,
  ) {
    return this.lifecycleService.createGroup(tournamentId, stageId, dto);
  }

  @Patch(':tournamentId/stages/:stageId/groups/:groupId')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  removeGroup(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    return this.lifecycleService.removeGroup(tournamentId, stageId, groupId);
  }

  @Post(':tournamentId/stages/:stageId/participants')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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

  @Post(':tournamentId/rule-versions')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.READ)
  getRuleVersions(@Param('tournamentId', ParseIntPipe) tournamentId: number) {
    return this.lifecycleService.getRuleVersions(tournamentId);
  }

  @Patch(':tournamentId/rule-versions/:ruleVersionId')
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  preview(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Body() dto: PreviewTournamentDto,
  ) {
    return this.lifecycleService.preview(tournamentId, dto);
  }

  @Post(':tournamentId/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
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
