import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { CommunityActor } from '../communities/communities.service';
import { CommunitySquadsService } from './community-squads.service';
import { TournamentApplicationsService } from './tournament-applications.service';
import {
  AddExistingPlayerDto,
  RegistrationPolicyDto,
  ReviewApplicationDto,
  ReviewTransferDto,
  SaveApplicationDto,
  SubmitApplicationDto,
} from './registration.dto';

type Request = { user: CommunityActor };
@Controller('registrations')
@UseGuards(JwtAuthGuard)
export class RegistrationsController {
  constructor(
    private readonly applications: TournamentApplicationsService,
    private readonly squads: CommunitySquadsService,
  ) {}
  @Get('workspace') workspace(@Req() req: Request) {
    return this.applications.workspace(req.user);
  }
  @Get('communities/:communityId/teams/:teamId/players') roster(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Req() req: Request,
  ) {
    return this.squads.roster(c, t, req.user);
  }
  @Get('communities/:communityId/teams/:teamId/player-search') search(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Query('q') q: string = '',
    @Req() req: Request,
  ) {
    return this.squads.search(c, t, q, req.user);
  }
  @Post('communities/:communityId/teams/:teamId/players') add(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Body() dto: AddExistingPlayerDto,
    @Req() req: Request,
  ) {
    return this.squads.addExisting(c, t, dto, req.user);
  }
  @Delete('communities/:communityId/teams/:teamId/players/:linkId') remove(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Param('linkId', ParseIntPipe) link: number,
    @Req() req: Request,
  ) {
    return this.squads.remove(c, t, link, req.user);
  }
  @Get('communities/:communityId/transfers') transfers(
    @Param('communityId', ParseIntPipe) c: number,
    @Req() req: Request,
  ) {
    return this.squads.transfers(c, req.user);
  }
  @Post('communities/:communityId/transfers/:requestId/review') reviewTransfer(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('requestId', ParseIntPipe) id: number,
    @Body() dto: ReviewTransferDto,
    @Req() req: Request,
  ) {
    return this.squads.reviewTransfer(c, id, dto, req.user);
  }
  @Get('tournaments/:id/applications') list(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.applications.list(id, req.user);
  }
  @Get('tournaments/:id') settings(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.applications.settings(id, req.user);
  }
  @Get('tournaments/:id/members') members(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.applications.members(id, req.user);
  }
  @Get('tournaments/:id/teams/:teamId') detail(
    @Param('id', ParseIntPipe) id: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Req() req: Request,
  ) {
    return this.applications.detail(id, teamId, req.user);
  }
  @Put('tournaments/:id/policy') policy(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrationPolicyDto,
    @Req() req: Request,
  ) {
    return this.applications.configure(id, dto, req.user);
  }
  @Post('tournaments/:id/open') open(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.applications.registration(id, 'open', req.user);
  }
  @Post('tournaments/:id/close') close(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.applications.registration(id, 'close', req.user);
  }
  @Put('tournaments/:id/teams/:teamId') save(
    @Param('id', ParseIntPipe) id: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: SaveApplicationDto,
    @Req() req: Request,
  ) {
    return this.applications.save(id, teamId, dto, req.user);
  }
  @Post('tournaments/:id/teams/:teamId/submit') submit(
    @Param('id', ParseIntPipe) id: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: SubmitApplicationDto,
    @Req() req: Request,
  ) {
    return this.applications.submit(id, teamId, dto.revisionId, req.user);
  }
  @Post('tournaments/:id/applications/:applicationId/review') review(
    @Param('id', ParseIntPipe) id: number,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Body() dto: ReviewApplicationDto,
    @Req() req: Request,
  ) {
    return this.applications.review(id, applicationId, dto, req.user);
  }
}
