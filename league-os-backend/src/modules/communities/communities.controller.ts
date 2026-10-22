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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunitiesService, CommunityActor } from './communities.service';
import {
  CommunityUsersQuery,
  CreateCommunityCompetitionDto,
  CreateCommunityDto,
  CreateCommunitySeasonDto,
  SetCommunityMemberDto,
} from './community.dto';

@Controller('communities')
@UseGuards(JwtAuthGuard)
export class CommunitiesController {
  constructor(private readonly service: CommunitiesService) {}
  @Get() list(@Req() req: { user: CommunityActor }) {
    return this.service.listForUser(req.user);
  }
  @Post() create(
    @Body() dto: CreateCommunityDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.create(dto, req.user);
  }
  @Get(':id/members') members(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: CommunityUsersQuery,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.members(id, q, req.user);
  }
  @Get(':id/user-search') candidates(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: CommunityUsersQuery,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.candidates(id, q.search, req.user);
  }
  @Patch(':id/members/:userId') setMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetCommunityMemberDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.setMember(id, userId, dto.role, req.user);
  }
  @Delete(':id/members/:userId') remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.setMember(id, userId, null, req.user);
  }
  @Get(':id/audit') audit(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: CommunityUsersQuery,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.history(id, q, req.user);
  }
  @Get(':id/context') context(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.context(id, req.user);
  }
  @Post(':id/competitions') competition(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommunityCompetitionDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.createCompetition(id, dto, req.user);
  }
  @Post(':id/seasons') season(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommunitySeasonDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.createSeason(id, dto, req.user);
  }
}
