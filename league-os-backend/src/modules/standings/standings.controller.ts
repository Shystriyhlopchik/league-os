import {Controller, Get, Param, ParseIntPipe, Post} from '@nestjs/common';
import {StandingsService} from "./standings.service";

@Controller('standings')
export class StandingsController {
    constructor(private readonly standingsService: StandingsService) {}

    @Get(':tournamentId')
    async getTournamentStandings(
        @Param('tournamentId', ParseIntPipe) tournamentId: number,
    ) {
        const standings = await this.standingsService.findMany({
            where: { tournamentId },
            relations: {
                team: true,
            },
            order: {
                points: 'DESC',
                goalDifference: 'DESC',
                goalsFor: 'DESC',
            },
        });

        return standings.map((standing, index) => ({
            position: index + 1,
            team: {
                id: standing.team.id,
                name: standing.team.name,
                logoUrl: standing.team.logoUrl,
            },
            played: standing.played,
            wins: standing.wins,
            draws: standing.draws,
            losses: standing.losses,
            goalsFor: standing.goalsFor,
            goalsAgainst: standing.goalsAgainst,
            goalDifference: standing.goalDifference,
            points: standing.points,
        }));
    }

    @Post(':tournamentId/recalculate')
    recalculateTournamentStandings(
        @Param('tournamentId', ParseIntPipe) tournamentId: number,
    ) {
        return this.standingsService.recalculateByTournament(tournamentId);
    }
}
