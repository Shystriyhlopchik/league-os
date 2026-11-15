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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TournamentAccessGuard } from '../tournaments/access/tournament-access.guard';
import { RequireTournamentAccess } from '../tournaments/access/tournament-access.decorator';
import { TournamentAccessAction } from '../tournaments/access/tournament-access-action.enum';

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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
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
  @UseGuards(JwtAuthGuard, TournamentAccessGuard)
  @RequireTournamentAccess(TournamentAccessAction.EDIT)
  recalculateTournamentStandings(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
  ) {
    return this.standingsService.recalculateByTournament(tournamentId);
  }
}
