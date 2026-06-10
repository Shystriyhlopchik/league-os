import {Controller, Get, Param, ParseIntPipe, Post} from '@nestjs/common';
import { MatchServiceService } from './match-service.service';
import { MatchServiceMatchDto } from './dto/match-service-match.dto';
import {MatchRosterCheckDto} from "./dto/match-roster-check.dto";

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
    return this.matchService.getRosterCheck(
        matchId,
    );
  }

  @Post('matches/:matchId/rosters/:teamId/approve')
  approveRoster(
      @Param('matchId', ParseIntPipe) matchId: number,
      @Param('teamId', ParseIntPipe) teamId: number,
  ): Promise<MatchRosterCheckDto> {
    return this.matchService.approveRoster(matchId, teamId);
  }
}
