import {Body, Controller, Get, Param, ParseIntPipe, Post} from '@nestjs/common';
import { MatchServiceService } from './match-service.service';
import { MatchServiceMatchDto } from './dto/match-service-match.dto';
import { MatchRosterCheckDto } from './dto/match-roster-check.dto';
import { MatchServiceSessionDto } from './dto/match-service-session.dto';
import {CreateMatchServiceEventDto} from "./dto/create-match-service-event.dto";
import {SyncMatchServiceEventsDto} from "./dto/sync-match-service-events.dto";
import {StartEventRecordingDto} from "./dto/start-event-recording.dto";

@Controller('match-service')
export class MatchServiceController {
  constructor(private readonly matchService: MatchServiceService) {}

  @Get('matches')
  findAvailableMatches(): Promise<MatchServiceMatchDto[]> {
    return this.matchService.findAvailableMatches();
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
  finishHalf(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.finishHalf(matchId);
  }

  @Post('matches/:matchId/start-second-half')
  startSecondHalf(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.startSecondHalf(matchId);
  }

  @Post('matches/:matchId/finish')
  finishMatch(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchService.finishMatch(matchId);
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
  cancelEventRecording(
      @Param('matchId', ParseIntPipe) matchId: number,
  ) {
    return this.matchService.cancelEventRecording(matchId);
  }

  @Post('matches/:matchId/events/:eventId/cancel')
  cancelEvent(
      @Param('matchId', ParseIntPipe) matchId: number,
      @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    return this.matchService.cancelEvent(matchId, eventId);
  }
}
