import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamPlayersService } from '../team-players/team-players.service';
import { CreateTeamPlayerDto } from '../team-players/dto/create-team-player.dto';

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
  createPlayerForTeam(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateTeamPlayerDto,
  ) {
    return this.teamPlayersService.createForTeam(teamId, dto);
  }
}
