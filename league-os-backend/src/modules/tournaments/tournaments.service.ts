import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';

import { BaseCrudService } from '../../common/base/base-crud.service';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { TournamentStatsSummaryDto } from './dto/tournament-stats-summary.dto';
import { TournamentEntity } from './entities/tournaments.entity';

@Injectable()
export class TournamentsService extends BaseCrudService<TournamentEntity> {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepository: Repository<TournamentEntity>,

    @InjectRepository(MatchEntity)
    private readonly matchesRepository: Repository<MatchEntity>,

    @InjectRepository(MatchEventEntity)
    private readonly matchEventsRepository: Repository<MatchEventEntity>,
  ) {
    super(tournamentsRepository, 'Турнир');
  }

  async findBySeason(seasonId: number) {
    const tournaments = await this.tournamentsRepository.find({
      where: {
        seasonId,
        isActive: true,
      },
      relations: {
        season: {
          competition: true,
        },
      },
      order: {
        startDate: 'ASC',
        id: 'ASC',
      },
    });

    return tournaments.map((tournament) => this.toPublicTournament(tournament));
  }

  async findActive() {
    const tournament = await this.tournamentsRepository
      .createQueryBuilder('tournament')
      .leftJoinAndSelect('tournament.season', 'season')
      .leftJoinAndSelect('season.competition', 'competition')
      .where('tournament.isActive = :isActive', { isActive: true })
      .andWhere('tournament.status != :cancelled', { cancelled: 'cancelled' })
      .orderBy(
        `CASE
          WHEN tournament.status = 'active' THEN 0
          WHEN tournament.lifecycle_status = 'in_progress' THEN 1
          WHEN tournament.lifecycle_status = 'published' THEN 2
          ELSE 3
        END`,
        'ASC',
      )
      .addOrderBy('tournament.startDate', 'DESC', 'NULLS LAST')
      .addOrderBy('tournament.id', 'DESC')
      .getOne();

    return tournament ? this.toPublicTournament(tournament) : null;
  }

  private toPublicTournament(tournament: TournamentEntity) {
    return {
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      description: tournament.description,
      type: tournament.type,
      format: tournament.format,
      status: tournament.status,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      logoUrl: tournament.logoUrl,
      colorPrimary: tournament.colorPrimary,

      season: {
        id: tournament.season.id,
        name: tournament.season.name,
        year: tournament.season.year,
      },

      competition: {
        id: tournament.season.competition.id,
        name: tournament.season.competition.name,
        slug: tournament.season.competition.slug,
        logoUrl: tournament.season.competition.logoUrl,
        colorPrimary: tournament.season.competition.colorPrimary,
      },
    };
  }

  async getStatsSummary(
    tournamentId: number,
    groupId?: number,
  ): Promise<TournamentStatsSummaryDto> {
    if (groupId !== undefined && groupId < 1) {
      throw new BadRequestException('groupId must be a positive integer');
    }
    const tournament = await this.tournamentsRepository.findOne({
      where: {
        id: tournamentId,
      },
      relations: {
        season: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const emptyStats = (): TournamentStatsSummaryDto => ({
      tournamentId,
      ...(groupId ? { groupId } : {}),
      seasonId: tournament.seasonId,
      competitionId: tournament.season.competitionId,
      year: tournament.season.year ?? null,
      played: 0,
      wins: 0,
      draws: 0,
      remaining: 0,
      penalties: 0,
      assists: 0,
      goals: 0,
      yellowCards: 0,
      redCards: 0,
    });

    const matches = await this.matchesRepository.find({
      where: {
        tournamentId,
        ...(groupId ? { groupId } : {}),
      },
      select: {
        id: true,
        status: true,
        homeScore: true,
        awayScore: true,
      },
    });

    const matchIds = matches.map((match) => match.id);
    const playedMatches = matches.filter(
      (match) => match.status === MatchStatus.FINISHED,
    );

    const played = playedMatches.length;
    const wins = playedMatches.filter(
      (match) => match.homeScore !== match.awayScore,
    ).length;
    const draws = playedMatches.filter(
      (match) => match.homeScore === match.awayScore,
    ).length;
    const remaining = matches.filter((match) =>
      [MatchStatus.SCHEDULED, MatchStatus.LIVE].includes(match.status),
    ).length;

    if (matchIds.length === 0) {
      return {
        ...emptyStats(),
        played,
        wins,
        draws,
        remaining,
      };
    }

    const [penalties, assists, yellowCards, redCards, goals] =
      await Promise.all([
        this.matchEventsRepository.count({
          where: {
            matchId: In(matchIds),
            isCancelled: false,
            eventType: In([
              MatchEventType.PENALTY_GOAL,
              MatchEventType.PENALTY_MISSED,
            ]),
          },
        }),
        this.matchEventsRepository.count({
          where: {
            matchId: In(matchIds),
            isCancelled: false,
            assistPlayerId: Not(IsNull()),
          },
        }),
        this.matchEventsRepository.count({
          where: {
            matchId: In(matchIds),
            isCancelled: false,
            eventType: In([
              MatchEventType.YELLOW_CARD,
              MatchEventType.SECOND_YELLOW_CARD,
            ]),
          },
        }),
        this.matchEventsRepository.count({
          where: {
            matchId: In(matchIds),
            isCancelled: false,
            eventType: MatchEventType.RED_CARD,
          },
        }),
        this.getGoalsCount(matchIds),
      ]);

    return {
      tournamentId,
      ...(groupId ? { groupId } : {}),
      seasonId: tournament.seasonId,
      competitionId: tournament.season.competitionId,
      year: tournament.season.year ?? null,
      played,
      wins,
      draws,
      remaining,
      penalties,
      assists,
      goals,
      yellowCards,
      redCards,
    };
  }

  private async getGoalsCount(matchIds: number[]): Promise<number> {
    const goalEvents = await this.matchEventsRepository.find({
      where: {
        matchId: In(matchIds),
        isCancelled: false,
        eventType: In([
          MatchEventType.GOAL,
          MatchEventType.OWN_GOAL,
          MatchEventType.PENALTY_GOAL,
        ]),
      },
      select: {
        goalValue: true,
      },
    });

    return goalEvents.reduce((sum, event) => sum + event.goalValue, 0);
  }
}
