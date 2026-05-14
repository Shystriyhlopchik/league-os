import {Controller, Get, Param, ParseIntPipe} from '@nestjs/common';
import { TournamentsService } from './tournaments.service';

@Controller('tournaments')
export class TournamentsController {
    constructor(private readonly tournamentsService: TournamentsService) {}

    @Get('season/:seasonId')
    getBySeason(@Param('seasonId', ParseIntPipe) seasonId: number) {
        return this.tournamentsService.findBySeason(seasonId);
    }
}
