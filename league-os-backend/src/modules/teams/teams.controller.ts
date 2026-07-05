import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamPlayersService } from '../team-players/team-players.service';
import { CreateTeamPlayerDto } from '../team-players/dto/create-team-player.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly teamPlayersService: TeamPlayersService,
  ) {}

  @Get()
  findMany() {
    return this.teamsService.findMany();
  }

  @Get(':teamId/players')
  findPlayersByTeam(@Param('teamId', ParseIntPipe) teamId: number) {
    return this.teamPlayersService.findByTeam(teamId);
  }

  @Post(':teamId/players')
  @UseGuards(JwtAuthGuard)
  createPlayerForTeam(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateTeamPlayerDto,
    @Req() req: any,
  ) {
    return this.teamPlayersService.createForTeam(teamId, dto, req.user.id);
  }
}
