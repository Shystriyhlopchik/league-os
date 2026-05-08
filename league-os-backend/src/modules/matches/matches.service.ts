import {BadRequestException, Injectable} from '@nestjs/common';
import {InjectRepository} from "@nestjs/typeorm";
import {MatchEntity} from "./entities/match.entity";
import {DeepPartial, Repository} from "typeorm";
import {BaseCrudService} from "../../common/base/base-crud.service";

const ERR_MESSAGE = 'Команды в матче не могут быть одинаковыми';

@Injectable()
export class MatchesService extends BaseCrudService<MatchEntity> {
    constructor(
        @InjectRepository(MatchEntity)
        private readonly matchesRepository: Repository<MatchEntity>,
    ) {
        super(matchesRepository, 'Матч');
    }

    override create(dto: DeepPartial<MatchEntity>): Promise<MatchEntity> {
        if (dto.homeTeamId === dto.awayTeamId) {
            throw new BadRequestException(ERR_MESSAGE);
        }

        return super.create(dto);
    }

    override updateOne(
        query: Partial<MatchEntity>,
        dto: DeepPartial<MatchEntity>,
    ): Promise<MatchEntity> {
        if (
            dto.homeTeamId &&
            dto.awayTeamId &&
            dto.homeTeamId === dto.awayTeamId
        ) {
            throw new BadRequestException(ERR_MESSAGE);
        }

        return super.updateOne(query, dto);
    }

    async findByTournamentForSlider(tournamentId: number) {
        const matches = await this.matchesRepository.find({
            where: { tournamentId },
            relations: {
                homeTeam: true,
                awayTeam: true,
                venue: true,
            },
            order: {
                matchDatetime: 'ASC',
                id: 'ASC',
            },
        });

        return matches.map((match) => ({
            id: match.id,
            tournamentId: match.tournamentId,
            round: match.round,
            status: match.status,
            matchDateTime: match.matchDatetime,

            homeTeam: {
                id: match.homeTeam.id,
                name: match.homeTeam.name,
                shortName: match.homeTeam.shortName,
                logoUrl: match.homeTeam.logoUrl,
            },

            awayTeam: {
                id: match.awayTeam.id,
                name: match.awayTeam.name,
                shortName: match.awayTeam.shortName,
                logoUrl: match.awayTeam.logoUrl,
            },

            score: {
                home: match.homeScore,
                away: match.awayScore,
            },

            venue: match.venue
                ? {
                    id: match.venue.id,
                    name: match.venue.name,
                }
                : null,
        }));
    }
}
