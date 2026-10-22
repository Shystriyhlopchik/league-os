import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { FeatureFlag } from '../../common/feature-flags/feature-flag.enum';
import { FeatureFlagGuard } from '../../common/feature-flags/feature-flag.guard';
import { RequireFeature } from '../../common/feature-flags/require-feature.decorator';
import { RecalculateStageStandingsDto } from './dto/recalculate-stage-standings.dto';
import { StandingsService } from './standings.service';

@Controller('standings')
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @Get('tournaments/:tournamentId/public-view')
  @UseGuards(FeatureFlagGuard)
  @RequireFeature(FeatureFlag.MultiStagePublicView)
  getPublicTournamentView(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
  ) {
    return this.standingsService.getPublicTournamentView(tournamentId);
  }

  @Get('tournaments/:tournamentId/stages/:stageId/groups/:groupId')
  getGroupStandings(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    return this.standingsService.getStageStandings(
      tournamentId,
      stageId,
      groupId,
    );
  }

  @Post('tournaments/:tournamentId/stages/:stageId/groups/:groupId/recalculate')
  recalculateGroupStandings(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: RecalculateStageStandingsDto,
  ) {
    return this.standingsService.recalculateStage(
      tournamentId,
      stageId,
      groupId,
      dto,
    );
  }

  @Get('tournaments/:tournamentId/stages/:stageId')
  getStageStandings(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
  ) {
    return this.standingsService.getStageStandings(tournamentId, stageId);
  }

  @Post('tournaments/:tournamentId/stages/:stageId/recalculate')
  recalculateStageStandings(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: RecalculateStageStandingsDto,
  ) {
    return this.standingsService.recalculateStage(
      tournamentId,
      stageId,
      undefined,
      dto,
    );
  }

  @Get(':tournamentId')
  getTournamentStandings(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
  ) {
    return this.standingsService.getLegacyTournamentStandings(tournamentId);
  }

  @Post(':tournamentId/recalculate')
  recalculateTournamentStandings(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
  ) {
    return this.standingsService.recalculateByTournament(tournamentId);
  }
}
