import {Controller, Get, Param, ParseIntPipe} from '@nestjs/common';
import {MatchesService} from "./matches.service";

@Controller('matches')
export class MatchesController {
    constructor(private readonly matchesService: MatchesService) {}

    @Get('tournament/:tournamentId')
    getTournamentMatches(
        @Param('tournamentId', ParseIntPipe) tournamentId: number,
    ) {
        return this.matchesService.findByTournamentForSlider(tournamentId);
    }

    @Get('season/:seasonId')
    findBySeason(@Param('seasonId', ParseIntPipe) seasonId: number) {
        return this.matchesService.findBySeason(seasonId);
    }
}
