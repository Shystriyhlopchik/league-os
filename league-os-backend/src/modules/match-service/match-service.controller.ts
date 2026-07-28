import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MatchServiceService } from './match-service.service';
import { MatchServiceMatchDto } from './dto/match-service-match.dto';
import { MatchRosterCheckDto } from './dto/match-roster-check.dto';
import { MatchServiceSessionDto } from './dto/match-service-session.dto';
import { CreateMatchServiceEventDto } from './dto/create-match-service-event.dto';
import { SyncMatchServiceEventsDto } from './dto/sync-match-service-events.dto';
import { StartEventRecordingDto } from './dto/start-event-recording.dto';
import { ActivateRedBallDto } from './dto/match-red-ball-activation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SaveMatchRegistrationDto } from './dto/save-match-registration.dto';
import { CreateManualMatchEventDto } from './dto/create-manual-match-event.dto';
import { FinalizeMatchResultDto } from './dto/finalize-match-result.dto';
import { RoleCode } from '../users/enums/role-code.enum';

@Controller('match-service')
export class MatchServiceController {
  constructor(private readonly matchService: MatchServiceService) {}

  @Get('matches')
  findAvailableMatches(): Promise<MatchServiceMatchDto[]> {
    return this.matchService.findAvailableMatches();
  }

  @Get('overdue-matches')
  findOverdueMatches(): Promise<MatchServiceMatchDto[]> {
    return this.matchService.findOverdueMatches();
  }

  @Get('finished-matches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Admin, RoleCode.SuperAdmin)
  findFinishedMatches(): Promise<MatchServiceMatchDto[]> {
    return this.matchService.findFinishedMatches();
  }

  @Get('finished-matches/:matchId/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Admin, RoleCode.SuperAdmin)
  findFinishedMatchEvents(
    @Param('matchId', ParseIntPipe) matchId: number,
  ) {
    return this.matchService.findFinishedMatchEvents(matchId);
  }

  @Post('finished-matches/:matchId/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Admin, RoleCode.SuperAdmin)
  createFinishedMatchEvent(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: CreateManualMatchEventDto,
  ) {
    return this.matchService.createFinishedMatchEvent(matchId, dto);
  }

  @Delete('finished-matches/:matchId/events/:eventId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Admin, RoleCode.SuperAdmin)
  cancelFinishedMatchEvent(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    return this.matchService.cancelFinishedMatchEvent(matchId, eventId);
  }

  @Get('finished-matches/:matchId/teams/:teamId/roster')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Admin, RoleCode.SuperAdmin)
  getFinishedMatchRegistration(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
  ) {
    return this.matchService.getFinishedMatchRegistration(matchId, teamId);
  }

  @Put('finished-matches/:matchId/teams/:teamId/roster')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Admin, RoleCode.SuperAdmin)
  saveFinishedMatchRegistration(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: SaveMatchRegistrationDto,
  ) {
    return this.matchService.saveFinishedMatchRegistration(
      matchId,
      teamId,
      dto.teamPlayerIds,
    );
  }

  @Get('matches/:matchId/manual-events')
  @UseGuards(JwtAuthGuard)
  findManualEvents(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.findManualEvents(matchId);
  }

  @Post('matches/:matchId/manual-events')
  @UseGuards(JwtAuthGuard)
  createManualEvent(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: CreateManualMatchEventDto,
  ) {
    return this.matchService.createManualEvent(matchId, dto);
  }

  @Delete('matches/:matchId/manual-events/:eventId')
  @UseGuards(JwtAuthGuard)
  cancelManualEvent(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    return this.matchService.cancelManualEvent(matchId, eventId);
  }

  @Post('matches/:matchId/manual-protocol/sign')
  @UseGuards(JwtAuthGuard)
  signManualProtocol(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: FinalizeMatchResultDto,
  ) {
    return this.matchService.signManualProtocol(matchId, dto);
  }

  @Get('registration-matches')
  @UseGuards(JwtAuthGuard)
  findRegistrationMatches(@Req() req: any): Promise<MatchServiceMatchDto[]> {
    return this.matchService.findRegistrationMatches(req.user.id);
  }

  @Get('registration-matches/:matchId/teams/:teamId/roster')
  @UseGuards(JwtAuthGuard)
  getMatchRegistration(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Req() req: any,
  ) {
    return this.matchService.getMatchRegistration(matchId, teamId, req.user.id);
  }

  @Put('registration-matches/:matchId/teams/:teamId/roster')
  @UseGuards(JwtAuthGuard)
  saveMatchRegistration(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: SaveMatchRegistrationDto,
    @Req() req: any,
  ) {
    return this.matchService.saveMatchRegistration(
      matchId,
      teamId,
      dto.teamPlayerIds,
      req.user.id,
    );
  }

  @Put('match-results/:matchId/teams/:teamId/roster')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.Referee, RoleCode.Admin, RoleCode.SuperAdmin)
  saveMatchRegistrationByOfficial(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: SaveMatchRegistrationDto,
    @Req() req: any,
  ) {
    return this.matchService.saveMatchRegistrationByOfficial(
      matchId,
      teamId,
      dto.teamPlayerIds,
      req.user.id,
    );
  }

  @Post('registration-matches/:matchId/teams/:teamId/roster/approve')
  @UseGuards(JwtAuthGuard)
  approveMatchRegistration(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Req() req: any,
  ) {
    return this.matchService.approveMatchRegistration(
      matchId,
      teamId,
      req.user.id,
    );
  }

  @Get('matches/:matchId/rosters')
  getRosterCheck(
    @Param('matchId', ParseIntPipe)
    matchId: number,
  ): Promise<MatchRosterCheckDto> {
    return this.matchService.getRosterCheck(matchId);
  }

  @Post('matches/:matchId/rosters/:teamId/approve')
  approveRoster(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
  ): Promise<MatchRosterCheckDto> {
    return this.matchService.approveRoster(matchId, teamId);
  }

  @Get('matches/:matchId/session')
  getSession(
    @Param('matchId', ParseIntPipe) matchId: number,
  ): Promise<MatchServiceSessionDto> {
    return this.matchService.getSession(matchId);
  }

  @Post('matches/:matchId/start')
  startMatch(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.startMatch(matchId);
  }

  @Post('matches/:matchId/pause')
  pauseMatch(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.pauseMatch(matchId);
  }

  @Post('matches/:matchId/resume')
  resumeMatch(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.resumeMatch(matchId);
  }

  @Post('matches/:matchId/finish-half')
  finishHalf(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: FinalizeMatchResultDto,
  ) {
    return this.matchService.finishHalf(matchId, dto);
  }

  @Post('matches/:matchId/start-second-half')
  startSecondHalf(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.startSecondHalf(matchId);
  }

  @Post('matches/:matchId/finish')
  finishMatch(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: FinalizeMatchResultDto,
  ) {
    return this.matchService.finishMatch(matchId, dto);
  }

  @Post('matches/:matchId/events')
  createEvent(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: CreateMatchServiceEventDto,
  ) {
    return this.matchService.createEvent(matchId, dto);
  }

  @Post('matches/:matchId/events/sync')
  syncEvents(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: SyncMatchServiceEventsDto,
  ) {
    return this.matchService.syncEvents(matchId, dto);
  }

  @Post('matches/:matchId/events/start-recording')
  startEventRecording(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: StartEventRecordingDto,
  ) {
    return this.matchService.startEventRecording(matchId, dto);
  }

  @Post('matches/:matchId/events/cancel-recording')
  cancelEventRecording(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.cancelEventRecording(matchId);
  }

  @Post('matches/:matchId/events/:eventId/cancel')
  cancelEvent(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    return this.matchService.cancelEvent(matchId, eventId);
  }

  @Post('matches/:matchId/red-ball/activate')
  activateRedBall(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: ActivateRedBallDto,
  ) {
    return this.matchService.activateRedBall(matchId, dto);
  }

  @Post('matches/:matchId/sign-protocol')
  signProtocol(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.signProtocol(matchId);
  }
}
