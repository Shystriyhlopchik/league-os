import {BadRequestException, Injectable, NotFoundException} from '@nestjs/common';
import { MatchServiceMatchDto } from './dto/match-service-match.dto';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import {Between, DeepPartial, LessThan, MoreThanOrEqual, Repository} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import {
  MatchRosterCheckDto,
  MatchRosterPlayerDto, MatchRosterWarningsDto,
  PlayerEligibilityReason,
  PlayerEligibilityStatus
} from './dto/match-roster-check.dto';
import {PlayerTournamentStatEntity} from "../player-tournament-stats/entities/player-tournament-stat.entity";
import {SuspensionReason} from "../player-tournament-stats/enums/suspension-reason.enum";
import {MatchRosterEntity} from "../match-rosters/entities/match-roster.entity";
import {MatchRosterPlayerEntity} from "../match-rosters/entities/match-roster-player.entity";
import {MatchServiceSessionEntity} from "./entities/match-service-session.entity";
import {MatchEventEntity} from "../match-events/entities/match-event.entity";
import {MatchServiceStatus} from "./enums/match-service-status.enum";
import {MatchServiceSessionDto} from "./dto/match-service-session.dto";
import {MatchEventType} from "../match-events/enums/match-event-type.enum";
import {PlayerTournamentStatsService} from "../player-tournament-stats/player-tournament-stats.service";
import {StartEventRecordingDto} from "./dto/start-event-recording.dto";
import {CreateMatchServiceEventDto} from "./dto/create-match-service-event.dto";
import {SyncMatchServiceEventsDto} from "./dto/sync-match-service-events.dto";

type SyncEventResult =
    | {
  clientEventId?: string;
  status: 'synced';
  result: Awaited<ReturnType<MatchServiceService['createEvent']>>;
}
    | {
  clientEventId?: string;
  status: 'failed';
  message: string;
};

@Injectable()
export class MatchServiceService {
  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,

    @InjectRepository(TeamPlayerEntity)
    private readonly teamPlayerRepository: Repository<TeamPlayerEntity>,

    @InjectRepository(PlayerTournamentStatEntity)
    private readonly playerTournamentStatRepository: Repository<PlayerTournamentStatEntity>,

    @InjectRepository(MatchRosterEntity)
    private readonly matchRosterRepository: Repository<MatchRosterEntity>,

    @InjectRepository(MatchRosterPlayerEntity)
    private readonly matchRosterPlayerRepository: Repository<MatchRosterPlayerEntity>,

    @InjectRepository(MatchServiceSessionEntity)
    private readonly matchServiceSessionRepository: Repository<MatchServiceSessionEntity>,

    @InjectRepository(MatchEventEntity)
    private readonly matchEventRepository: Repository<MatchEventEntity>,

    private readonly playerTournamentStatsService: PlayerTournamentStatsService,
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

  private async findTeamRoster(
      match: MatchEntity,
      teamId: number,
  ): Promise<MatchRosterPlayerDto[]> {
    const teamPlayers = await this.teamPlayerRepository
        .createQueryBuilder('teamPlayer')
        .leftJoinAndSelect('teamPlayer.player', 'player')
        .where('teamPlayer.team_id = :teamId', { teamId })
        .andWhere('teamPlayer.isActive = true')
        .andWhere('player.isActive = true')
        .orderBy('teamPlayer.isCaptain', 'DESC')
        .addOrderBy('teamPlayer.shirtNumber', 'ASC')
        .getMany();

    const playerIds = teamPlayers.map((teamPlayer) => teamPlayer.playerId);

    const statsByPlayerId = await this.getStatsByPlayerIds(
        match.tournamentId,
        teamId,
        playerIds,
    );

    return teamPlayers.map((teamPlayer) => {
      const stat = statsByPlayerId.get(teamPlayer.playerId);

      return {
        id: teamPlayer.player.id,
        teamPlayerId: teamPlayer.id,

        firstName: teamPlayer.player.firstName,
        lastName: teamPlayer.player.lastName,
        middleName: teamPlayer.player.middleName,

        photoUrl: teamPlayer.player.photoUrl,
        shirtNumber: teamPlayer.shirtNumber,
        position: teamPlayer.position ?? teamPlayer.player.position,
        isCaptain: teamPlayer.isCaptain,

        yellowCards: stat?.yellowCards ?? 0,
        redCards: stat?.redCards ?? 0,
        secondYellowCards: stat?.secondYellowCards ?? 0,

        eligibilityStatus: this.getEligibilityStatus(stat, match.id),
        eligibilityReason: this.getEligibilityReason(stat, match.id),
      };
    });
  }

  async getRosterCheck(
      matchId: number,
  ): Promise<MatchRosterCheckDto> {
    const match = await this.matchRepository.findOne({
      where: {
        id: matchId,
      },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Матч не найден');
    }

    const [homeRoster, awayRoster, approvedRostersByTeamId] =
        await Promise.all([
          this.findTeamRoster(match, match.homeTeamId),
          this.findTeamRoster(match, match.awayTeamId),
          this.getApprovedRostersByTeamId(match.id),
        ]);

    return {
      match: {
        id: match.id,
        matchDatetime: match.matchDatetime,
        venueName: match.venue?.name,

        homeTeam: {
          id: match.homeTeam.id,
          name: match.homeTeam.name,
          logoUrl: match.homeTeam.logoUrl,
          rosterApproved: approvedRostersByTeamId.has(match.homeTeamId),
        },

        awayTeam: {
          id: match.awayTeam.id,
          name: match.awayTeam.name,
          logoUrl: match.awayTeam.logoUrl,
          rosterApproved: approvedRostersByTeamId.has(match.awayTeamId),
        },
      },

      warnings: this.buildWarnings([
        ...homeRoster,
        ...awayRoster,
      ]),

      homeRoster,
      awayRoster,
    };
  }

  async syncEvents(
      matchId: number,
      dto: SyncMatchServiceEventsDto,
  ) {
    const results: SyncEventResult[] = [];

    for (const eventDto of dto.events) {
      try {
        const result = await this.createEvent(matchId, eventDto);

        results.push({
          clientEventId: eventDto.clientEventId,
          status: 'synced',
          result,
        });
      } catch (error) {
        results.push({
          clientEventId: eventDto.clientEventId,
          status: 'failed',
          message:
              error instanceof Error
                  ? error.message
                  : 'Не удалось синхронизировать событие',
        });
      }
    }

    const sessionData = await this.getSession(matchId);

    return {
      results,
      session: sessionData.session,
      events: sessionData.events,
    };
  }

  private async getStatsByPlayerIds(
      tournamentId: number,
      teamId: number,
      playerIds: number[],
  ): Promise<Map<number, PlayerTournamentStatEntity>> {
    if (!playerIds.length) {
      return new Map();
    }

    const stats = await this.playerTournamentStatRepository
        .createQueryBuilder('stat')
        .where('stat.tournament_id = :tournamentId', { tournamentId })
        .andWhere('stat.team_id = :teamId', { teamId })
        .andWhere('stat.player_id IN (:...playerIds)', { playerIds })
        .getMany();

    return new Map(stats.map((stat) => [stat.playerId, stat]));
  }

  private getEligibilityStatus(
      stat: PlayerTournamentStatEntity | undefined,
      matchId: number,
  ): PlayerEligibilityStatus {
    if (!stat) {
      return 'allowed';
    }

    if (
        stat.isSuspended &&
        stat.suspendedUntilMatchId === matchId
    ) {
      return 'not_allowed';
    }

    if (stat.yellowCards === 3) {
      return 'check';
    }

    return 'allowed';
  }

  private getEligibilityReason(
      stat: PlayerTournamentStatEntity | undefined,
      matchId: number,
  ): PlayerEligibilityReason {
    if (!stat) {
      return 'none';
    }

    if (
        stat.isSuspended &&
        stat.suspendedUntilMatchId === matchId
    ) {
      if (stat.suspensionReason === SuspensionReason.FOUR_YELLOW_CARDS) {
        return 'four_yellows_suspension';
      }

      if (stat.suspensionReason === SuspensionReason.RED_CARD) {
        return 'red_card_suspension';
      }

      if (stat.suspensionReason === SuspensionReason.SECOND_YELLOW_CARD) {
        return 'second_yellow_suspension';
      }
    }

    if (stat.yellowCards === 3) {
      return 'three_yellows';
    }

    return 'none';
  }

  async approveRoster(
      matchId: number,
      teamId: number,
  ): Promise<MatchRosterCheckDto> {
    const match = await this.matchRepository.findOne({
      where: { id: matchId },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Матч не найден');
    }

    const isMatchTeam =
        match.homeTeamId === teamId || match.awayTeamId === teamId;

    if (!isMatchTeam) {
      throw new BadRequestException('Команда не участвует в этом матче');
    }

    const existingRoster = await this.matchRosterRepository.findOne({
      where: {
        matchId,
        teamId,
      },
    });

    if (existingRoster?.isApproved) {
      return this.getRosterCheck(matchId);
    }

    const roster =
        existingRoster ??
        this.matchRosterRepository.create({
          matchId,
          teamId,
          isApproved: false,
        });

    roster.isApproved = true;
    roster.approvedAt = new Date();

    const savedRoster = await this.matchRosterRepository.save(roster);

    await this.createRosterPlayersSnapshot(match, teamId, savedRoster.id);

    return this.getRosterCheck(matchId);
  }

  private async createRosterPlayersSnapshot(
      match: MatchEntity,
      teamId: number,
      matchRosterId: number,
  ): Promise<void> {
    await this.matchRosterPlayerRepository.delete({
      matchRosterId,
    });

    const players = await this.findTeamRoster(match, teamId);

    const allowedPlayers = players.filter(
        (player) => player.eligibilityStatus !== 'not_allowed',
    );

    const rosterPlayers: DeepPartial<MatchRosterPlayerEntity>[] =
        allowedPlayers.map((player) => ({
          matchRosterId,
          playerId: player.id,
          teamPlayerId: player.teamPlayerId,
          shirtNumber: player.shirtNumber,
          position: player.position,
          isCaptain: player.isCaptain,
          wasAllowed: player.eligibilityStatus === 'allowed',
        }));

    await this.matchRosterPlayerRepository.save(
        this.matchRosterPlayerRepository.create(rosterPlayers),
    );
  }

  private async getApprovedRostersByTeamId(
      matchId: number,
  ): Promise<Map<number, MatchRosterEntity>> {
    const rosters = await this.matchRosterRepository.find({
      where: {
        matchId,
        isApproved: true,
      },
    });

    return new Map(
        rosters.map((roster) => [roster.teamId, roster]),
    );
  }

  private buildWarnings(
      players: MatchRosterPlayerDto[],
  ): MatchRosterWarningsDto {
    const playersToCheckCount = players.filter(
        (player) => player.eligibilityStatus === 'check',
    ).length;

    const yellowCardsSuspensionCount = players.filter(
        (player) =>
            player.eligibilityReason ===
            'four_yellows_suspension',
    ).length;

    const redCardSuspensionCount = players.filter(
        (player) =>
            player.eligibilityReason ===
            'red_card_suspension' ||
            player.eligibilityReason ===
            'second_yellow_suspension',
    ).length;

    return {
      totalWarningsCount:
          playersToCheckCount +
          yellowCardsSuspensionCount +
          redCardSuspensionCount,

      playersToCheckCount,

      yellowCardsSuspensionCount,

      redCardSuspensionCount,
    };
  }

  private async assertBothRostersApproved(match: MatchEntity): Promise<void> {
    const approvedRosters = await this.getApprovedRostersByTeamId(match.id);

    const homeApproved = approvedRosters.has(match.homeTeamId);
    const awayApproved = approvedRosters.has(match.awayTeamId);

    if (!homeApproved || !awayApproved) {
      throw new BadRequestException(
          'Нельзя начать обслуживание матча: составы обеих команд должны быть утверждены',
      );
    }
  }

  private async getOrCreateSession(
      match: MatchEntity,
  ): Promise<MatchServiceSessionEntity> {
    let session = await this.matchServiceSessionRepository.findOne({
      where: {
        matchId: match.id,
      },
    });

    if (!session) {
      session = this.matchServiceSessionRepository.create({
        matchId: match.id,
        status: MatchServiceStatus.NOT_STARTED,
        previousStatus: null,
        currentHalf: 1,
        elapsedSeconds: 0,
        startedAt: null,
        pausedAt: null,
        finishedAt: null,
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
      });

      session = await this.matchServiceSessionRepository.save(session);
    }

    return session;
  }

  private async findMatchForService(matchId: number): Promise<MatchEntity> {
    const match = await this.matchRepository.findOne({
      where: {
        id: matchId,
      },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        tournament: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Матч не найден');
    }

    return match;
  }

  private async getApprovedRosterPlayers(match: MatchEntity) {
    const rosters = await this.matchRosterRepository.find({
      where: {
        matchId: match.id,
        isApproved: true,
      },
    });

    const rosterByTeamId = new Map(
        rosters.map((roster) => [roster.teamId, roster]),
    );

    const homeRoster = rosterByTeamId.get(match.homeTeamId);
    const awayRoster = rosterByTeamId.get(match.awayTeamId);

    if (!homeRoster || !awayRoster) {
      throw new BadRequestException(
          'Составы обеих команд должны быть утверждены',
      );
    }

    const [homePlayers, awayPlayers] = await Promise.all([
      this.matchRosterPlayerRepository.find({
        where: {
          matchRosterId: homeRoster.id,
        },
        relations: {
          player: true,
        },
        order: {
          shirtNumber: 'ASC',
          id: 'ASC',
        },
      }),
      this.matchRosterPlayerRepository.find({
        where: {
          matchRosterId: awayRoster.id,
        },
        relations: {
          player: true,
        },
        order: {
          shirtNumber: 'ASC',
          id: 'ASC',
        },
      }),
    ]);

    return {
      home: homePlayers.map((rosterPlayer) => ({
        id: rosterPlayer.playerId,
        matchRosterPlayerId: rosterPlayer.id,
        teamPlayerId: rosterPlayer.teamPlayerId,
        firstName: rosterPlayer.player.firstName,
        lastName: rosterPlayer.player.lastName,
        middleName: rosterPlayer.player.middleName,
        shirtNumber: rosterPlayer.shirtNumber,
        isCaptain: rosterPlayer.isCaptain,
      })),

      away: awayPlayers.map((rosterPlayer) => ({
        id: rosterPlayer.playerId,
        matchRosterPlayerId: rosterPlayer.id,
        teamPlayerId: rosterPlayer.teamPlayerId,
        firstName: rosterPlayer.player.firstName,
        lastName: rosterPlayer.player.lastName,
        middleName: rosterPlayer.player.middleName,
        shirtNumber: rosterPlayer.shirtNumber,
        isCaptain: rosterPlayer.isCaptain,
      })),
    };
  }

  async getSession(matchId: number): Promise<MatchServiceSessionDto> {
    const match = await this.findMatchForService(matchId);

    await this.assertBothRostersApproved(match);

    const session = await this.getOrCreateSession(match);

    const [rosters, events] = await Promise.all([
      this.getApprovedRosterPlayers(match),
      this.getMatchEvents(match.id),
    ]);

    return {
      match: {
        id: match.id,
        tournamentId: match.tournamentId,
        round: match.round,
        status: match.status,
        matchDatetime: match.matchDatetime,

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
      },

      session: this.mapSession(session),

      rosters,

      events,
    };
  }

  private async getMatchEvents(matchId: number) {
    const events = await this.matchEventRepository.find({
      where: {
        matchId,
        isCancelled: false,
      },
      relations: {
        team: true,
        player: true,
        assistPlayer: true,
        secondaryPlayer: true,
      },
      order: {
        half: 'ASC',
        second: 'ASC',
        minute: 'ASC',
        id: 'ASC',
      },
    });

    return events.map((event) => ({
      id: event.id,
      clientEventId: event.clientEventId,
      eventType: event.eventType,
      matchId: event.matchId,
      teamId: event.teamId,
      playerId: event.playerId,
      assistPlayerId: event.assistPlayerId,
      secondaryPlayerId: event.secondaryPlayerId,
      half: event.half,
      second: event.second,
      minute: event.minute,
      addedMinute: event.addedMinute,
      description: event.description,
      isCancelled: event.isCancelled,

      team: event.team
          ? {
            id: event.team.id,
            name: event.team.name,
            shortName: event.team.shortName,
          }
          : undefined,

      player: event.player
          ? {
            id: event.player.id,
            firstName: event.player.firstName,
            lastName: event.player.lastName,
          }
          : undefined,

      assistPlayer: event.assistPlayer
          ? {
            id: event.assistPlayer.id,
            firstName: event.assistPlayer.firstName,
            lastName: event.assistPlayer.lastName,
          }
          : undefined,

      secondaryPlayer: event.secondaryPlayer
          ? {
            id: event.secondaryPlayer.id,
            firstName: event.secondaryPlayer.firstName,
            lastName: event.secondaryPlayer.lastName,
          }
          : undefined,
    }));
  }

  private mapSession(session: MatchServiceSessionEntity) {
    return {
      id: session.id,
      matchId: session.matchId,
      status: session.status,
      previousStatus: session.previousStatus,
      currentHalf: session.currentHalf,
      elapsedSeconds: session.elapsedSeconds,
      startedAt: session.startedAt,
      pausedAt: session.pausedAt,
      finishedAt: session.finishedAt,
      homeScore: session.homeScore,
      awayScore: session.awayScore,
    };
  }

  private applyElapsedTime(session: MatchServiceSessionEntity): void {
    if (!session.startedAt) {
      return;
    }

    const now = new Date();

    const diffSeconds = Math.floor(
        (now.getTime() - session.startedAt.getTime()) / 1000,
    );

    session.elapsedSeconds += Math.max(diffSeconds, 0);
    session.startedAt = null;
  }

  private async createSystemEvent(params: {
    match: MatchEntity;
    session: MatchServiceSessionEntity;
    eventType: MatchEventType;
    description?: string;
  }): Promise<void> {
    const { match, session, eventType, description } = params;

    await this.matchEventRepository.save(
        this.matchEventRepository.create({
          matchId: match.id,
          teamId: match.homeTeamId,
          eventType,
          half: session.currentHalf,
          second: session.elapsedSeconds,
          minute: Math.max(1, Math.ceil(session.elapsedSeconds / 60)),
          description,
        }),
    );
  }

  async startMatch(matchId: number) {
    const match = await this.findMatchForService(matchId);

    await this.assertBothRostersApproved(match);

    const session = await this.getOrCreateSession(match);

    if (session.status !== MatchServiceStatus.NOT_STARTED) {
      throw new BadRequestException('Матч уже был начат');
    }

    session.status = MatchServiceStatus.FIRST_HALF;
    session.previousStatus = null;
    session.currentHalf = 1;
    session.elapsedSeconds = 0;
    session.startedAt = new Date();
    session.pausedAt = null;
    session.finishedAt = null;

    match.status = MatchStatus.LIVE;

    const savedSession = await this.matchServiceSessionRepository.save(session);
    await this.matchRepository.save(match);

    await this.createSystemEvent({
      match,
      session: savedSession,
      eventType: MatchEventType.MATCH_STARTED,
      description: 'Матч начался',
    });

    return this.mapSession(savedSession);
  }

  async pauseMatch(matchId: number) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    if (
        session.status !== MatchServiceStatus.FIRST_HALF &&
        session.status !== MatchServiceStatus.SECOND_HALF
    ) {
      throw new BadRequestException('Поставить на паузу можно только идущий тайм');
    }

    this.applyElapsedTime(session);

    session.previousStatus = session.status;
    session.status = MatchServiceStatus.PAUSED;
    session.pausedAt = new Date();

    const savedSession = await this.matchServiceSessionRepository.save(session);

    await this.createSystemEvent({
      match,
      session: savedSession,
      eventType: MatchEventType.MATCH_PAUSED,
      description: 'Матч поставлен на паузу',
    });

    return this.mapSession(savedSession);
  }

  async resumeMatch(matchId: number) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    if (session.status !== MatchServiceStatus.PAUSED) {
      throw new BadRequestException('Матч не находится на паузе');
    }

    if (!session.previousStatus) {
      throw new BadRequestException('Не удалось определить состояние до паузы');
    }

    session.status = session.previousStatus;
    session.previousStatus = null;
    session.startedAt = new Date();
    session.pausedAt = null;

    const savedSession = await this.matchServiceSessionRepository.save(session);

    await this.createSystemEvent({
      match,
      session: savedSession,
      eventType: MatchEventType.MATCH_RESUMED,
      description: 'Матч возобновлён',
    });

    return this.mapSession(savedSession);
  }

  async finishHalf(matchId: number) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    if (
        session.status !== MatchServiceStatus.FIRST_HALF &&
        session.status !== MatchServiceStatus.SECOND_HALF
    ) {
      throw new BadRequestException('Завершить можно только идущий тайм');
    }

    this.applyElapsedTime(session);

    session.startedAt = null;
    session.pausedAt = null;
    session.previousStatus = null;

    if (session.status === MatchServiceStatus.FIRST_HALF) {
      session.status = MatchServiceStatus.HALF_TIME;
      session.currentHalf = 1;
    } else {
      session.status = MatchServiceStatus.FINISHED;
      session.finishedAt = new Date();

      match.status = MatchStatus.FINISHED;
      match.homeScore = session.homeScore;
      match.awayScore = session.awayScore;

      await this.matchRepository.save(match);
    }

    const savedSession = await this.matchServiceSessionRepository.save(session);

    await this.createSystemEvent({
      match,
      session: savedSession,
      eventType: MatchEventType.HALF_FINISHED,
      description:
          savedSession.status === MatchServiceStatus.HALF_TIME
              ? 'Первый тайм завершён'
              : 'Второй тайм завершён',
    });

    return this.mapSession(savedSession);
  }

  async startSecondHalf(matchId: number) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    if (session.status !== MatchServiceStatus.HALF_TIME) {
      throw new BadRequestException(
          'Второй тайм можно начать только после завершения первого',
      );
    }

    session.status = MatchServiceStatus.SECOND_HALF;
    session.previousStatus = null;
    session.currentHalf = 2;
    session.elapsedSeconds = 0;
    session.startedAt = new Date();
    session.pausedAt = null;

    const savedSession = await this.matchServiceSessionRepository.save(session);

    await this.createSystemEvent({
      match,
      session: savedSession,
      eventType: MatchEventType.SECOND_HALF_STARTED,
      description: 'Второй тайм начался',
    });

    return this.mapSession(savedSession);
  }

  private readonly gameEventTypes = new Set<MatchEventType>([
    MatchEventType.GOAL,
    MatchEventType.OWN_GOAL,
    MatchEventType.YELLOW_CARD,
    MatchEventType.SECOND_YELLOW_CARD,
    MatchEventType.RED_CARD,
    MatchEventType.RED_BALL,
  ]);

  async finishMatch(matchId: number) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    if (
        session.status !== MatchServiceStatus.SECOND_HALF &&
        session.status !== MatchServiceStatus.PAUSED
    ) {
      throw new BadRequestException('Завершить можно только второй тайм');
    }

    if (session.status === MatchServiceStatus.SECOND_HALF) {
      this.applyElapsedTime(session);
    }

    session.status = MatchServiceStatus.FINISHED;
    session.previousStatus = null;
    session.startedAt = null;
    session.pausedAt = null;
    session.finishedAt = new Date();

    match.status = MatchStatus.FINISHED;
    match.homeScore = session.homeScore;
    match.awayScore = session.awayScore;

    const savedSession = await this.matchServiceSessionRepository.save(session);
    await this.matchRepository.save(match);

    await this.createSystemEvent({
      match,
      session: savedSession,
      eventType: MatchEventType.MATCH_FINISHED,
      description: 'Матч завершён',
    });

    return this.mapSession(savedSession);
  }

  async startEventRecording(
      matchId: number,
      dto: StartEventRecordingDto,
  ) {
    const match = await this.findMatchForService(matchId);

    await this.assertBothRostersApproved(match);

    const session = await this.getOrCreateSession(match);

    if (
        session.status !== MatchServiceStatus.FIRST_HALF &&
        session.status !== MatchServiceStatus.SECOND_HALF
    ) {
      throw new BadRequestException(
          'Начать фиксацию события можно только во время идущего тайма',
      );
    }

    if (!this.gameEventTypes.has(dto.eventType)) {
      throw new BadRequestException('Недопустимый тип игрового события');
    }

    const fixedSecond = this.getCurrentElapsedSeconds(session);
    const fixedMinute = this.getEventMinute(fixedSecond);

    session.elapsedSeconds = fixedSecond;
    session.previousStatus = session.status;
    session.status = MatchServiceStatus.EVENT_RECORDING;
    session.startedAt = null;
    session.pausedAt = new Date();

    const savedSession = await this.matchServiceSessionRepository.save(session);

    return {
      session: this.mapSession(savedSession),
      eventDraft: {
        eventType: dto.eventType,
        half: savedSession.currentHalf,
        second: fixedSecond,
        minute: fixedMinute,
      },
    };
  }

  private getCurrentElapsedSeconds(session: MatchServiceSessionEntity): number {
    if (!session.startedAt) {
      return session.elapsedSeconds;
    }

    const now = new Date();

    const diffSeconds = Math.floor(
        (now.getTime() - session.startedAt.getTime()) / 1000,
    );

    return session.elapsedSeconds + Math.max(diffSeconds, 0);
  }

  private getEventMinute(second: number): number {
    return Math.max(1, Math.ceil(second / 60));
  }

  private assertCanCreateGameEvent(session: MatchServiceSessionEntity): void {
    if (
        session.status !== MatchServiceStatus.EVENT_RECORDING &&
        session.status !== MatchServiceStatus.PAUSED &&
        session.status !== MatchServiceStatus.FIRST_HALF &&
        session.status !== MatchServiceStatus.SECOND_HALF
    ) {
      throw new BadRequestException(
          'Событие можно добавить только во время матча',
      );
    }
  }

  async createEvent(
      matchId: number,
      dto: CreateMatchServiceEventDto,
  ) {
    const match = await this.findMatchForService(matchId);

    await this.assertBothRostersApproved(match);

    const session = await this.getOrCreateSession(match);

    this.assertCanCreateGameEvent(session);

    if (!this.gameEventTypes.has(dto.eventType)) {
      throw new BadRequestException('Недопустимый тип игрового события');
    }

    this.assertTeamBelongsToMatch(match, dto.teamId);

    if (dto.clientEventId) {
      const existingEvent = await this.matchEventRepository.findOne({
        where: {
          clientEventId: dto.clientEventId,
        },
      });

      if (existingEvent) {
        return {
          event: await this.mapEvent(existingEvent),
          session: this.mapSession(session),
          duplicated: true,
        };
      }
    }

    await this.assertPlayerInApprovedRoster({
      matchId,
      teamId: dto.teamId,
      playerId: dto.playerId,
      fieldName: 'playerId',
    });

    await this.assertPlayerInApprovedRoster({
      matchId,
      teamId: dto.teamId,
      playerId: dto.assistPlayerId,
      fieldName: 'assistPlayerId',
    });

    await this.assertPlayerInApprovedRoster({
      matchId,
      teamId: dto.teamId,
      playerId: dto.secondaryPlayerId,
      fieldName: 'secondaryPlayerId',
    });

    const second = dto.second ?? this.getCurrentElapsedSeconds(session);
    const minute = dto.minute ?? this.getEventMinute(second);
    const half = dto.half ?? session.currentHalf;

    const event = this.matchEventRepository.create({
      matchId,
      teamId: dto.teamId,
      eventType: dto.eventType,
      playerId: dto.playerId,
      assistPlayerId: dto.assistPlayerId,
      secondaryPlayerId: dto.secondaryPlayerId,
      description: dto.description,
      clientEventId: dto.clientEventId,
      half,
      second,
      minute,
      isCancelled: false,
    });

    const savedEvent = await this.matchEventRepository.save(event);

    this.applyScoreByEvent({
      match,
      session,
      eventType: dto.eventType,
      teamId: dto.teamId,
    });

    if (
        dto.autoResume !== false &&
        session.status === MatchServiceStatus.EVENT_RECORDING
    ) {
      if (!session.previousStatus) {
        throw new BadRequestException(
            'Не удалось определить состояние до фиксации события',
        );
      }

      session.status = session.previousStatus;
      session.previousStatus = null;
      session.startedAt = new Date();
      session.pausedAt = null;
    }

    const savedSession = await this.matchServiceSessionRepository.save(session);

    if (savedEvent.playerId) {
      await this.playerTournamentStatsService.applyCardEvent({
        match,
        teamId: savedEvent.teamId,
        playerId: savedEvent.playerId,
        eventType: savedEvent.eventType,
      });
    }

    return {
      event: await this.mapEvent(savedEvent),
      session: this.mapSession(savedSession),
      duplicated: false,
    };
  }

  private assertTeamBelongsToMatch(match: MatchEntity, teamId: number): void {
    if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) {
      throw new BadRequestException('Команда не участвует в этом матче');
    }
  }

  async cancelEventRecording(matchId: number) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    if (session.status !== MatchServiceStatus.EVENT_RECORDING) {
      throw new BadRequestException('Сейчас не идёт фиксация события');
    }

    if (!session.previousStatus) {
      throw new BadRequestException(
          'Не удалось определить состояние до фиксации события',
      );
    }

    session.status = session.previousStatus;
    session.previousStatus = null;
    session.startedAt = new Date();
    session.pausedAt = null;

    const savedSession = await this.matchServiceSessionRepository.save(session);

    return this.mapSession(savedSession);
  }

  private applyScoreByEvent(params: {
    match: MatchEntity;
    session: MatchServiceSessionEntity;
    eventType: MatchEventType;
    teamId: number;
  }): void {
    const { match, session, eventType, teamId } = params;

    if (eventType === MatchEventType.GOAL) {
      if (teamId === match.homeTeamId) {
        session.homeScore += 1;
      } else {
        session.awayScore += 1;
      }
    }

    if (eventType === MatchEventType.OWN_GOAL) {
      if (teamId === match.homeTeamId) {
        session.awayScore += 1;
      } else {
        session.homeScore += 1;
      }
    }
  }

  private async assertPlayerInApprovedRoster(params: {
    matchId: number;
    teamId: number;
    playerId?: number;
    fieldName: string;
  }): Promise<void> {
    const { matchId, teamId, playerId, fieldName } = params;

    if (!playerId) {
      return;
    }

    const roster = await this.matchRosterRepository.findOne({
      where: {
        matchId,
        teamId,
        isApproved: true,
      },
    });

    if (!roster) {
      throw new BadRequestException('Утверждённый состав команды не найден');
    }

    const rosterPlayer = await this.matchRosterPlayerRepository.findOne({
      where: {
        matchRosterId: roster.id,
        playerId,
      },
    });

    if (!rosterPlayer) {
      throw new BadRequestException(
          `Игрок из поля ${fieldName} отсутствует в утверждённом составе`,
      );
    }
  }

  private async mapEvent(event: MatchEventEntity) {
    const fullEvent = await this.matchEventRepository.findOne({
      where: {
        id: event.id,
      },
      relations: {
        team: true,
        player: true,
        assistPlayer: true,
        secondaryPlayer: true,
      },
    });

    if (!fullEvent) {
      throw new NotFoundException('Событие матча не найдено');
    }

    return {
      id: fullEvent.id,
      clientEventId: fullEvent.clientEventId,
      eventType: fullEvent.eventType,
      matchId: fullEvent.matchId,
      teamId: fullEvent.teamId,
      playerId: fullEvent.playerId,
      assistPlayerId: fullEvent.assistPlayerId,
      secondaryPlayerId: fullEvent.secondaryPlayerId,
      half: fullEvent.half,
      second: fullEvent.second,
      minute: fullEvent.minute,
      addedMinute: fullEvent.addedMinute,
      description: fullEvent.description,
      isCancelled: fullEvent.isCancelled,

      team: fullEvent.team
          ? {
            id: fullEvent.team.id,
            name: fullEvent.team.name,
            shortName: fullEvent.team.shortName,
          }
          : undefined,

      player: fullEvent.player
          ? {
            id: fullEvent.player.id,
            firstName: fullEvent.player.firstName,
            lastName: fullEvent.player.lastName,
          }
          : undefined,

      assistPlayer: fullEvent.assistPlayer
          ? {
            id: fullEvent.assistPlayer.id,
            firstName: fullEvent.assistPlayer.firstName,
            lastName: fullEvent.assistPlayer.lastName,
          }
          : undefined,

      secondaryPlayer: fullEvent.secondaryPlayer
          ? {
            id: fullEvent.secondaryPlayer.id,
            firstName: fullEvent.secondaryPlayer.firstName,
            lastName: fullEvent.secondaryPlayer.lastName,
          }
          : undefined,
    };
  }

  private rollbackScoreByEvent(params: {
    match: MatchEntity;
    session: MatchServiceSessionEntity;
    event: MatchEventEntity;
  }): void {
    const { match, session, event } = params;

    if (event.eventType === MatchEventType.GOAL) {
      if (event.teamId === match.homeTeamId) {
        session.homeScore = Math.max(session.homeScore - 1, 0);
      } else {
        session.awayScore = Math.max(session.awayScore - 1, 0);
      }
    }

    if (event.eventType === MatchEventType.OWN_GOAL) {
      if (event.teamId === match.homeTeamId) {
        session.awayScore = Math.max(session.awayScore - 1, 0);
      } else {
        session.homeScore = Math.max(session.homeScore - 1, 0);
      }
    }
  }

  async cancelEvent(matchId: number, eventId: number) {
    const match = await this.findMatchForService(matchId);

    const session = await this.getOrCreateSession(match);

    if (session.status === MatchServiceStatus.PROTOCOL_SIGNED) {
      throw new BadRequestException(
          'Нельзя отменить событие после подписания протокола',
      );
    }

    const event = await this.matchEventRepository.findOne({
      where: {
        id: eventId,
        matchId,
      },
    });

    if (!event) {
      throw new NotFoundException('Событие матча не найдено');
    }

    if (event.isCancelled) {
      throw new BadRequestException('Событие уже отменено');
    }

    event.isCancelled = true;

    this.rollbackScoreByEvent({
      match,
      session,
      event,
    });

    const savedEvent = await this.matchEventRepository.save(event);
    const savedSession = await this.matchServiceSessionRepository.save(session);

    return {
      cancelledEvent: await this.mapEvent(savedEvent),
      session: this.mapSession(savedSession),
      events: await this.getMatchEvents(matchId),
    };
  }
}
