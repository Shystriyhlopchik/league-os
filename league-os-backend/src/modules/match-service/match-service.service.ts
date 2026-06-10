import { Injectable } from '@nestjs/common';
import { MatchServiceMatchDto } from './dto/match-service-match.dto';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { Between, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class MatchServiceService {
  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
  ) {}

  async findAvailableMatches(): Promise<MatchServiceMatchDto[]> {
    const now = new Date();

    const overdueMatches = await this.matchRepository.find({
      where: {
        status: MatchStatus.SCHEDULED,
        matchDatetime: LessThan(now),
      },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        tournament: true,
      },
      order: {
        matchDatetime: 'ASC',
        id: 'ASC',
      },
    });

    const nearestMatch = await this.matchRepository.findOne({
      where: {
        status: MatchStatus.SCHEDULED,
        matchDatetime: MoreThanOrEqual(now),
      },
      order: {
        matchDatetime: 'ASC',
        id: 'ASC',
      },
    });

    if (!nearestMatch?.matchDatetime) {
      return overdueMatches.map((match) => this.toDto(match));
    }

    const startOfDay = new Date(nearestMatch.matchDatetime);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(nearestMatch.matchDatetime);
    endOfDay.setHours(23, 59, 59, 999);

    const nearestRoundMatches = await this.matchRepository.find({
      where: {
        status: MatchStatus.SCHEDULED,
        matchDatetime: Between(startOfDay, endOfDay),
      },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        tournament: true,
      },
      order: {
        matchDatetime: 'ASC',
        id: 'ASC',
      },
    });

    const matchesById = new Map<number, MatchEntity>();

    [...overdueMatches, ...nearestRoundMatches].forEach((match) => {
      matchesById.set(match.id, match);
    });

    return Array.from(matchesById.values()).map((match) => this.toDto(match));
  }

  private toDto(match: MatchEntity): MatchServiceMatchDto {
    return {
      id: match.id,
      tournamentId: match.tournamentId,
      round: match.round,
      matchDatetime: match.matchDatetime,
      status: match.status,

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

      venue: match.venue
        ? {
            id: match.venue.id,
            name: match.venue.name,
          }
        : undefined,
    };
  }
}
