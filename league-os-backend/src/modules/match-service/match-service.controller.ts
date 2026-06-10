import { Controller, Get } from '@nestjs/common';
import { MatchServiceService } from './match-service.service';
import { MatchServiceMatchDto } from './dto/match-service-match.dto';

@Controller('match-service')
export class MatchServiceController {
  constructor(private readonly matchService: MatchServiceService) {}

  @Get('matches')
  findAvailableMatches(): Promise<MatchServiceMatchDto[]> {
    return this.matchService.findAvailableMatches();
  }
}
