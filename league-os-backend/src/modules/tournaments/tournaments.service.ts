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
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../tournament-teams/enums/tournament-team-status.enum';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { TeamEntity } from '../teams/entities/team.entity';
import {
  PlayerLeaderboardEntryDto,
  PlayerLeaderboardMetric,
  TournamentPlayerLeadersDto,
} from './dto/tournament-player-leaders.dto';

interface PlayerLeaderboardAccumulator {
  player: PlayerLeaderboardEntryDto['player'];
  team: PlayerLeaderboardEntryDto['team'];
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  goalMatchIds: Set<number>;
}

@Injectable()
export class TournamentsService extends BaseCrudService<TournamentEntity> {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepository: Repository<TournamentEntity>,

    @InjectRepository(MatchEntity)
    private readonly matchesRepository: Repository<MatchEntity>,

    @InjectRepository(MatchEventEntity)
    private readonly matchEventsRepository: Repository<MatchEventEntity>,

    @InjectRepository(TournamentTeamEntity)
    private readonly tournamentTeamsRepository: Repository<TournamentTeamEntity>,

    @InjectRepository(MatchRosterPlayerEntity)
    private readonly matchRosterPlayersRepository: Repository<MatchRosterPlayerEntity>,
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

  async findPublicTeams(tournamentId: number) {
    const tournament = await this.tournamentsRepository.findOne({
      where: { id: tournamentId, isActive: true },
      select: { id: true },
    });
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const tournamentTeams = await this.tournamentTeamsRepository.find({
      where: {
        tournamentId,
        status: TournamentTeamStatus.ACTIVE,
        team: { isActive: true },
      },
      relations: { team: true },
      order: { seedNumber: 'ASC', id: 'ASC' },
    });

    return tournamentTeams.map(({ team }) => ({
      id: team.id,
      name: team.name,
      shortName: team.shortName ?? null,
      slug: team.slug,
      logoUrl: team.logoUrl ?? null,
      primaryColor: team.primaryColor ?? null,
      secondaryColor: team.secondaryColor ?? null,
      city: team.city ?? null,
      village: team.village ?? null,
      isActive: team.isActive,
    }));
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

  async getPlayerLeaders(
    tournamentId: number,
    groupId?: number,
  ): Promise<TournamentPlayerLeadersDto> {
    if (groupId !== undefined && groupId < 1) {
      throw new BadRequestException('groupId must be a positive integer');
    }

    const tournamentExists = await this.tournamentsRepository.existsBy({
      id: tournamentId,
    });
    if (!tournamentExists) {
      throw new NotFoundException('Tournament not found');
    }

    const matches = await this.matchesRepository.find({
      where: {
        tournamentId,
        status: MatchStatus.FINISHED,
        ...(groupId ? { groupId } : {}),
      },
      select: { id: true },
    });
    const matchIds = matches.map((match) => match.id);

    if (matchIds.length === 0) {
      return this.emptyPlayerLeaders(tournamentId, groupId);
    }

    const [events, rosterPlayers] = await Promise.all([
      this.matchEventsRepository.find({
        where: { matchId: In(matchIds), isCancelled: false },
        relations: { player: true, assistPlayer: true, team: true },
        order: { id: 'ASC' },
      }),
      this.matchRosterPlayersRepository.find({
        where: {
          matchRoster: { matchId: In(matchIds) },
          wasAllowed: true,
        },
        relations: { matchRoster: true },
      }),
    ]);

    const accumulators = new Map<number, PlayerLeaderboardAccumulator>();
    const appearances = new Map<number, Set<number>>();

    for (const rosterPlayer of rosterPlayers) {
      const playerAppearances =
        appearances.get(rosterPlayer.playerId) ?? new Set<number>();
      playerAppearances.add(rosterPlayer.matchRoster.matchId);
      appearances.set(rosterPlayer.playerId, playerAppearances);
    }

    const goalEventTypes = new Set<MatchEventType>([
      MatchEventType.GOAL,
      MatchEventType.PENALTY_GOAL,
    ]);
    const yellowCardEventTypes = new Set<MatchEventType>([
      MatchEventType.YELLOW_CARD,
      MatchEventType.SECOND_YELLOW_CARD,
    ]);

    for (const event of events) {
      if (event.player && goalEventTypes.has(event.eventType)) {
        const accumulator = this.getOrCreateLeaderboardAccumulator(
          accumulators,
          event.player,
          event.team,
        );
        accumulator.goals += event.goalValue;
        accumulator.goalMatchIds.add(event.matchId);
      }

      if (event.assistPlayer && goalEventTypes.has(event.eventType)) {
        const accumulator = this.getOrCreateLeaderboardAccumulator(
          accumulators,
          event.assistPlayer,
          event.team,
        );
        accumulator.assists += 1;
      }

      if (event.player && yellowCardEventTypes.has(event.eventType)) {
        this.getOrCreateLeaderboardAccumulator(
          accumulators,
          event.player,
          event.team,
        ).yellowCards += 1;
      }

      if (event.player && event.eventType === MatchEventType.RED_CARD) {
        this.getOrCreateLeaderboardAccumulator(
          accumulators,
          event.player,
          event.team,
        ).redCards += 1;
      }
    }

    const values = [...accumulators.values()];
    const goalsPerGame = (item: PlayerLeaderboardAccumulator): number => {
      const playedMatchIds = new Set([
        ...(appearances.get(item.player.id) ?? []),
        ...item.goalMatchIds,
      ]);
      return playedMatchIds.size
        ? Number((item.goals / playedMatchIds.size).toFixed(2))
        : 0;
    };

    return {
      tournamentId,
      ...(groupId ? { groupId } : {}),
      leaderboards: {
        goals: this.buildLeaderboard(values, (item) => item.goals),
        assists: this.buildLeaderboard(values, (item) => item.assists),
        yellowCards: this.buildLeaderboard(values, (item) => item.yellowCards),
        redCards: this.buildLeaderboard(values, (item) => item.redCards),
        goalContributions: this.buildLeaderboard(
          values,
          (item) => item.goals + item.assists,
        ),
        goalsPerGame: this.buildLeaderboard(values, goalsPerGame),
      },
    };
  }

  private getOrCreateLeaderboardAccumulator(
    accumulators: Map<number, PlayerLeaderboardAccumulator>,
    player: PlayerEntity,
    team: TeamEntity,
  ): PlayerLeaderboardAccumulator {
    const existing = accumulators.get(player.id);
    if (existing) {
      // The latest event determines the displayed team after a transfer.
      existing.team = this.toLeaderboardTeam(team);
      return existing;
    }

    const accumulator: PlayerLeaderboardAccumulator = {
      player: {
        id: player.id,
        name: [player.firstName, player.lastName].filter(Boolean).join(' '),
        photoUrl: player.photoUrl ?? null,
      },
      team: this.toLeaderboardTeam(team),
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      goalMatchIds: new Set<number>(),
    };
    accumulators.set(player.id, accumulator);
    return accumulator;
  }

  private toLeaderboardTeam(
    team: TeamEntity,
  ): PlayerLeaderboardEntryDto['team'] {
    return {
      id: team.id,
      name: team.name,
      logoUrl: team.logoUrl ?? null,
    };
  }

  private buildLeaderboard(
    items: PlayerLeaderboardAccumulator[],
    getValue: (item: PlayerLeaderboardAccumulator) => number,
  ): PlayerLeaderboardEntryDto[] {
    return items
      .map((item) => ({ item, value: getValue(item) }))
      .filter(({ value }) => value > 0)
      .sort(
        (left, right) =>
          right.value - left.value ||
          left.item.player.name.localeCompare(right.item.player.name, 'ru') ||
          left.item.player.id - right.item.player.id,
      )
      .slice(0, 3)
      .map(({ item, value }, index) => ({
        position: index + 1,
        value,
        player: item.player,
        team: item.team,
      }));
  }

  private emptyPlayerLeaders(
    tournamentId: number,
    groupId?: number,
  ): TournamentPlayerLeadersDto {
    const emptyLeaderboards = (): Record<
      PlayerLeaderboardMetric,
      PlayerLeaderboardEntryDto[]
    > => ({
      goals: [],
      assists: [],
      yellowCards: [],
      redCards: [],
      goalContributions: [],
      goalsPerGame: [],
    });

    return {
      tournamentId,
      ...(groupId ? { groupId } : {}),
      leaderboards: emptyLeaderboards(),
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
