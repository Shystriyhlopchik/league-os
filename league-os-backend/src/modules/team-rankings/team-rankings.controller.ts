import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';

import { TeamRankingsService } from './team-rankings.service';

@Controller('team-rankings')
export class TeamRankingsController {
  constructor(private readonly teamRankingsService: TeamRankingsService) {}

  @Get('competitions/:competitionId/current')
  getCurrent(@Param('competitionId', ParseIntPipe) competitionId: number) {
    return this.teamRankingsService.getCurrent(competitionId);
  }

  @Get('competitions/:competitionId/historical')
  getHistorical(@Param('competitionId', ParseIntPipe) competitionId: number) {
    return this.teamRankingsService.getHistorical(competitionId);
  }
}
