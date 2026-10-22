import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { CommunityActor } from '../communities/communities.service';
import { TeamWorkspaceService } from './team-workspace.service';
import {
  RequestTeamAccessDto,
  ReviewTeamAccessDto,
  SetTeamManagerDto,
  TeamProfileDto,
  TeamProfileVersionDto,
  UpdateTeamProfileDto,
} from './dto/team-workspace.dto';

type Request = { user: CommunityActor };
@Controller('team-workspace')
@UseGuards(JwtAuthGuard)
export class TeamWorkspaceController {
  constructor(private readonly service: TeamWorkspaceService) {}
  @Get() workspace(@Req() req: Request) {
    return this.service.workspace(req.user);
  }
  @Get('search') search(@Query('q') q = '') {
    return this.service.search(q);
  }
  @Post('teams') create(@Body() dto: TeamProfileDto, @Req() req: Request) {
    return this.service.create(dto, req.user);
  }
  @Post('access-requests') requestAccess(
    @Body() dto: RequestTeamAccessDto,
    @Req() req: Request,
  ) {
    return this.service.requestAccess(dto, req.user);
  }
  @Get('communities/:communityId/access-requests') requests(
    @Param('communityId', ParseIntPipe) c: number,
    @Req() req: Request,
  ) {
    return this.service.accessRequests(c, req.user);
  }
  @Post('communities/:communityId/access-requests/:requestId/review') review(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('requestId', ParseIntPipe) id: number,
    @Body() dto: ReviewTeamAccessDto,
    @Req() req: Request,
  ) {
    return this.service.reviewAccess(c, id, dto, req.user);
  }
  @Get('communities/:communityId/teams/:teamId') profile(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Req() req: Request,
  ) {
    return this.service.profile(c, t, req.user);
  }
  @Patch('communities/:communityId/teams/:teamId') update(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Body() dto: UpdateTeamProfileDto,
    @Req() req: Request,
  ) {
    return this.service.update(c, t, dto, req.user);
  }
  @Post('communities/:communityId/teams/:teamId/publish') publish(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Body() dto: TeamProfileVersionDto,
    @Req() req: Request,
  ) {
    return this.service.publish(c, t, dto.expectedVersion, req.user);
  }
  @Post('communities/:communityId/teams/:teamId/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  logo(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Body() dto: TeamProfileVersionDto,
    @Req() req: Request,
    @UploadedFile() logo?: { buffer: Buffer },
  ) {
    return this.service.uploadLogo(
      c,
      t,
      dto.expectedVersion,
      req.user,
      logo?.buffer,
    );
  }
  @Get('communities/:communityId/teams/:teamId/managers') managers(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Req() req: Request,
  ) {
    return this.service.managers(c, t, req.user);
  }
  @Post('communities/:communityId/teams/:teamId/managers') setManager(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Body() dto: SetTeamManagerDto,
    @Req() req: Request,
  ) {
    return this.service.setManager(c, t, dto, req.user);
  }
  @Delete('communities/:communityId/teams/:teamId/managers/:userId')
  removeManager(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('teamId', ParseIntPipe) t: number,
    @Param('userId', ParseIntPipe) u: number,
    @Req() req: Request,
  ) {
    return this.service.removeManager(c, t, u, req.user);
  }
}
