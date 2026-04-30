import { Injectable } from '@nestjs/common';
import {InjectRepository} from "@nestjs/typeorm";
import {StandingEntity} from "./entities/standing.entity";
import {DeepPartial, Repository} from "typeorm";
import {BaseCrudService} from "../../common/base/base-crud.service";
import {MatchEntity} from "../matches/entities/match.entity";
import {MatchStatus} from "../matches/enums/match-status.enum";
import {TeamStandingStats} from "./types/team-standing-stats.type";


@Injectable()
export class StandingsService extends BaseCrudService<StandingEntity>{
    constructor(
        @InjectRepository(StandingEntity)
        private readonly standingsRepository: Repository<StandingEntity>,

        @InjectRepository(MatchEntity)
        private readonly matchesRepository: Repository<MatchEntity>,
    ) {
        super(standingsRepository, 'Строка турнирной таблицы');
    }

    override create(dto: DeepPartial<StandingEntity>): Promise<StandingEntity> {
        dto.goalDifference = Number(dto.goalsFor ?? 0) - Number(dto.goalsAgainst ?? 0);

        return super.create(dto);
    }

    override updateOne(query, dto: DeepPartial<StandingEntity>): Promise<StandingEntity> {
        if (dto.goalsFor !== undefined || dto.goalsAgainst !== undefined) {
            dto.goalDifference = Number(dto.goalsFor ?? 0) - Number(dto.goalsAgainst ?? 0);
        }

        return super.updateOne(query, dto);
    }

    async recalculateByTournament(tournamentId: number): Promise<StandingEntity[]> {
        const matches = await this.matchesRepository.find({
            where: {
                tournamentId,
                status: MatchStatus.FINISHED,
            },
        });

        const table = new Map<number, TeamStandingStats>();

        const getOrCreateStats = (teamId: number): TeamStandingStats => {
            const existing = table.get(teamId);

            if (existing) {
                return existing;
            }

            const stats: TeamStandingStats = {
                tournamentId,
                teamId,
                played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                goalDifference: 0,
                points: 0,
            };

            table.set(teamId, stats);

            return stats;
        };

        for (const match of matches) {
            const home = getOrCreateStats(match.homeTeamId);
            const away = getOrCreateStats(match.awayTeamId);

            home.played += 1;
            away.played += 1;

            home.goalsFor += match.homeScore;
            home.goalsAgainst += match.awayScore;

            away.goalsFor += match.awayScore;
            away.goalsAgainst += match.homeScore;

            if (match.homeScore > match.awayScore) {
                home.wins += 1;
                home.points += 3;

                away.losses += 1;
            } else if (match.homeScore < match.awayScore) {
                away.wins += 1;
                away.points += 3;

                home.losses += 1;
            } else {
                home.draws += 1;
                away.draws += 1;

                home.points += 1;
                away.points += 1;
            }
        }

        const standingsData = Array.from(table.values()).map((stats) => ({
            ...stats,
            goalDifference: stats.goalsFor - stats.goalsAgainst,
        }));

        await this.standingsRepository.delete({ tournamentId });

        const standings = this.standingsRepository.create(standingsData);

        return this.standingsRepository.save(standings);
    }
}
