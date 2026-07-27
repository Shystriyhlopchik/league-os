import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { PlayersService } from './players.service';

@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get('cards/tournament/:tournamentId')
  getTournamentCards(
    @Param('tournamentId', ParseIntPipe) tournamentId: number,
  ) {
    return this.playersService.getTournamentCards(tournamentId);
  }
}
