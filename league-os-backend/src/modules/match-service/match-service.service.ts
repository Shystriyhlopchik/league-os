import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatchServiceMatchDto } from './dto/match-service-match.dto';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import {
  Between,
  DataSource,
  DeepPartial,
  EntityManager,
  In,
  Repository,
  Brackets,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import {
  MatchRosterCheckDto,
  MatchRosterPlayerDto,
  MatchRosterWarningsDto,
  PlayerEligibilityReason,
  PlayerEligibilityStatus,
} from './dto/match-roster-check.dto';
import { PlayerTournamentStatEntity } from '../player-tournament-stats/entities/player-tournament-stat.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchServiceSessionEntity } from './entities/match-service-session.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchServiceStatus } from './enums/match-service-status.enum';
import { MatchServiceSessionDto } from './dto/match-service-session.dto';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { PlayerTournamentStatsService } from '../player-tournament-stats/player-tournament-stats.service';
import { StartEventRecordingDto } from './dto/start-event-recording.dto';
import { CreateMatchServiceEventDto } from './dto/create-match-service-event.dto';
import { SyncMatchServiceEventsDto } from './dto/sync-match-service-events.dto';
import { ActivateRedBallDto } from './dto/match-red-ball-activation.dto';
import {
  MatchRedBallActivationEntity,
  RedBallStatus,
} from './entities/match-red-ball-activation.entity';
import { UsersService } from '../users/users.service';
import { RoleCode } from '../users/enums/role-code.enum';
import { CreateManualMatchEventDto } from './dto/create-manual-match-event.dto';
import { TournamentLifecycleService } from '../tournaments/tournament-lifecycle.service';
import { KnockoutBracketService } from '../tournament-knockout-brackets/knockout-bracket.service';
import { FinalizeMatchResultDto } from './dto/finalize-match-result.dto';
import { MatchResultResolver } from '../matches/match-result.resolver';
import { MatchResolutionType } from '../matches/enums/match-resolution-type.enum';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import type { MatchRulesV1 } from '../tournament-rules/types/tournament-rules-config.type';
import {
  PlayerDisciplineEligibility,
  PlayerSuspensionsService,
} from '../player-suspensions/player-suspensions.service';
import { PlayerSuspensionReason } from '../player-suspensions/enums/player-suspension-reason.enum';
import {
  matchDateTimeAtOrAfterNow,
  matchDateTimeBeforeNow,
} from '../matches/helper/matchDatetimeNow';
import { formatLocalDateTime } from '../matches/helper/formatLocalDateTime';

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

const LEGACY_MATCH_RULES: MatchRulesV1 = {
  periods: 2,
  periodDurationMinutes: null,
  allowDraw: true,
  extraTime: { enabled: false },
  penalties: { enabled: false },
};

@Injectable()
export class MatchServiceService {
  private readonly correctableEventTypes = new Set<MatchEventType>([
    MatchEventType.GOAL,
    MatchEventType.OWN_GOAL,
    MatchEventType.PENALTY_GOAL,
    MatchEventType.PENALTY_MISSED,
    MatchEventType.YELLOW_CARD,
    MatchEventType.SECOND_YELLOW_CARD,
    MatchEventType.RED_CARD,
    MatchEventType.RED_BALL,
  ]);

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

    @InjectRepository(MatchRedBallActivationEntity)
    private readonly matchRedBallRepository: Repository<MatchRedBallActivationEntity>,

    private readonly playerTournamentStatsService: PlayerTournamentStatsService,
    private readonly playerSuspensionsService: PlayerSuspensionsService,
    private readonly usersService: UsersService,
    private readonly tournamentLifecycleService: TournamentLifecycleService,
    private readonly knockoutBracketService: KnockoutBracketService,
    private readonly matchResultResolver: MatchResultResolver,
    private readonly dataSource: DataSource,
  ) {}

  async findAvailableMatches(): Promise<MatchServiceMatchDto[]> {
    const overdueMatches = await this.matchRepository.find({
      where: {
        status: MatchStatus.SCHEDULED,
        matchDatetime: matchDateTimeBeforeNow(),
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
        matchDatetime: matchDateTimeAtOrAfterNow(),
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

  async findOverdueMatches(): Promise<MatchServiceMatchDto[]> {
    const matches = await this.matchRepository.find({
      where: {
        status: MatchStatus.SCHEDULED,
        matchDatetime: matchDateTimeBeforeNow(),
      },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        tournament: true,
      },
      order: {
        matchDatetime: 'DESC',
        id: 'ASC',
      },
    });

    return matches.map((match) => this.toDto(match));
  }

  async findFinishedMatches(): Promise<MatchServiceMatchDto[]> {
    const matches = await this.matchRepository.find({
      where: {
        status: MatchStatus.FINISHED,
      },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        tournament: true,
      },
      order: {
        matchDatetime: 'DESC',
        id: 'DESC',
      },
    });

    return matches.map((match) => this.toDto(match));
  }

  async findFinishedMatchEvents(
    matchId: number,
  ): Promise<MatchEventEntity[]> {
    await this.findFinishedMatch(matchId);

    return this.matchEventRepository.find({
      where: {
        matchId,
        isCancelled: false,
        eventType: In([...this.correctableEventTypes]),
      },
      order: { half: 'ASC', minute: 'ASC', id: 'ASC' },
    });
  }

  async createFinishedMatchEvent(
    matchId: number,
    dto: CreateManualMatchEventDto,
  ): Promise<MatchEventEntity> {
    if (!this.correctableEventTypes.has(dto.eventType)) {
      throw new BadRequestException('Недопустимый тип события');
    }

    const match = await this.findFinishedMatch(matchId);
    this.assertTeamParticipates(match, dto.teamId);
    this.assertFinishedScoringCorrectionAllowed(match, dto.eventType);
    await this.assertCorrectionEventParticipants(matchId, dto);

    const savedEvent = await this.dataSource.transaction(async (manager) => {
      const eventRepository = manager.getRepository(MatchEventEntity);
      const matchRepository = manager.getRepository(MatchEntity);
      const transactionalMatch = await matchRepository.findOne({
        where: { id: matchId, status: MatchStatus.FINISHED },
      });

      if (!transactionalMatch) {
        throw new NotFoundException('Завершённый матч не найден');
      }

      const event = await eventRepository.save(
        eventRepository.create({
          matchId,
          teamId: dto.teamId,
          eventType: dto.eventType,
          minute: dto.minute,
          half: dto.half,
          playerId: dto.playerId,
          assistPlayerId: dto.assistPlayerId,
          isCancelled: false,
        }),
      );

      if (this.isScoringEvent(event.eventType)) {
        await this.recalculateCorrectedMatchScore(
          transactionalMatch,
          manager,
        );
      }

      return event;
    });

    if (savedEvent.playerId) {
      await this.playerTournamentStatsService.applyCardEvent({
        match,
        teamId: savedEvent.teamId,
        playerId: savedEvent.playerId,
        eventType: savedEvent.eventType,
      });
    }

    return savedEvent;
  }

  async cancelFinishedMatchEvent(
    matchId: number,
    eventId: number,
  ): Promise<{ id: number; isCancelled: true }> {
    const match = await this.findFinishedMatch(matchId);
    const cancelledEvent = await this.dataSource.transaction(
      async (manager) => {
        const eventRepository = manager.getRepository(MatchEventEntity);
        const matchRepository = manager.getRepository(MatchEntity);
        const event = await eventRepository.findOne({
          where: { id: eventId, matchId, isCancelled: false },
        });

        if (!event || !this.correctableEventTypes.has(event.eventType)) {
          throw new NotFoundException('Событие матча не найдено');
        }

        this.assertFinishedScoringCorrectionAllowed(match, event.eventType);
        event.isCancelled = true;
        await eventRepository.save(event);

        if (this.isScoringEvent(event.eventType)) {
          const transactionalMatch = await matchRepository.findOne({
            where: { id: matchId, status: MatchStatus.FINISHED },
          });
          if (!transactionalMatch) {
            throw new NotFoundException('Завершённый матч не найден');
          }
          await this.recalculateCorrectedMatchScore(
            transactionalMatch,
            manager,
          );
        }

        return event;
      },
    );

    if (cancelledEvent.playerId) {
      await this.playerTournamentStatsService.revertCardEvent({
        match,
        teamId: cancelledEvent.teamId,
        playerId: cancelledEvent.playerId,
        eventType: cancelledEvent.eventType,
      });
    }

    return { id: cancelledEvent.id, isCancelled: true };
  }

  async getFinishedMatchRegistration(matchId: number, teamId: number) {
    const match = await this.findFinishedMatch(matchId, teamId);
    const roster = await this.matchRosterRepository.findOne({
      where: { matchId, teamId },
    });
    const [currentPlayers, selectedPlayers] = await Promise.all([
      this.findTeamRoster(match, teamId),
      roster ? this.findSubmittedTeamRoster(match, roster) : Promise.resolve([]),
    ]);
    const candidatesByTeamPlayerId = new Map<number, MatchRosterPlayerDto>();

    for (const player of [...currentPlayers, ...selectedPlayers]) {
      if (player.teamPlayerId) {
        candidatesByTeamPlayerId.set(player.teamPlayerId, player);
      }
    }

    const selectedTeamPlayerIds = new Set(
      selectedPlayers.map((player) => player.teamPlayerId),
    );
    const team = teamId === match.homeTeamId ? match.homeTeam : match.awayTeam;

    return {
      match: this.toDto(match),
      team: {
        id: team.id,
        name: team.name,
        logoUrl: team.logoUrl,
      },
      isApproved: true,
      players: [...candidatesByTeamPlayerId.values()].map((player) => ({
        ...player,
        eligibilityStatus: 'allowed' as const,
        eligibilityReason: 'none' as const,
        isSelected: selectedTeamPlayerIds.has(player.teamPlayerId),
      })),
    };
  }

  async saveFinishedMatchRegistration(
    matchId: number,
    teamId: number,
    teamPlayerIds: number[],
  ) {
    const match = await this.findFinishedMatch(matchId, teamId);
    if (teamPlayerIds.length < 5) {
      throw new BadRequestException(
        'В протоколе каждой команды должно быть минимум 5 игроков',
      );
    }

    const registration = await this.getFinishedMatchRegistration(
      matchId,
      teamId,
    );
    const candidatesByTeamPlayerId = new Map(
      registration.players.map((player) => [player.teamPlayerId, player]),
    );
    const selectedPlayers = teamPlayerIds.map((id) =>
      candidatesByTeamPlayerId.get(id),
    );

    if (selectedPlayers.some((player) => !player)) {
      throw new BadRequestException(
        'В протоколе есть игрок, который не относится к выбранной команде',
      );
    }

    const uniquePlayerIds = new Set(
      selectedPlayers.map((player) => player!.id),
    );
    if (uniquePlayerIds.size !== selectedPlayers.length) {
      throw new BadRequestException('Игрок не может быть добавлен дважды');
    }

    const roster = await this.matchRosterRepository.findOne({
      where: { matchId, teamId },
    });
    const currentRosterPlayers = roster
      ? await this.matchRosterPlayerRepository.find({
          where: { matchRosterId: roster.id },
        })
      : [];
    const removedPlayerIds = currentRosterPlayers
      .filter((player) => !uniquePlayerIds.has(player.playerId))
      .map((player) => player.playerId);

    if (removedPlayerIds.length) {
      const events = await this.matchEventRepository.find({
        where: { matchId, isCancelled: false },
      });
      const referencedPlayerId = removedPlayerIds.find((playerId) =>
        events.some(
          (event) =>
            event.playerId === playerId ||
            event.assistPlayerId === playerId ||
            event.secondaryPlayerId === playerId,
        ),
      );
      if (referencedPlayerId) {
        throw new BadRequestException(
          'Сначала удалите события исключаемого игрока из протокола',
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const rosterRepository = manager.getRepository(MatchRosterEntity);
      const rosterPlayerRepository = manager.getRepository(
        MatchRosterPlayerEntity,
      );
      let savedRoster = await rosterRepository.findOne({
        where: { matchId, teamId },
      });

      if (!savedRoster) {
        savedRoster = await rosterRepository.save(
          rosterRepository.create({
            matchId,
            teamId,
            isSubmitted: true,
            isApproved: true,
          }),
        );
      }

      await rosterPlayerRepository.delete({
        matchRosterId: savedRoster.id,
      });
      await rosterPlayerRepository.save(
        selectedPlayers.map((player) =>
          rosterPlayerRepository.create({
            matchRosterId: savedRoster!.id,
            playerId: player!.id,
            teamPlayerId: player!.teamPlayerId,
            shirtNumber: player!.shirtNumber,
            position: player!.position,
            isCaptain: player!.isCaptain,
            wasAllowed: true,
          }),
        ),
      );
      savedRoster.isSubmitted = true;
      savedRoster.isApproved = true;
      await rosterRepository.save(savedRoster);
    });

    return this.getFinishedMatchRegistration(match.id, teamId);
  }

  async findManualEvents(matchId: number): Promise<MatchEventEntity[]> {
    return this.matchEventRepository.find({
      where: { matchId, isCancelled: false },
      order: { half: 'ASC', minute: 'ASC', id: 'ASC' },
    });
  }

  async createManualEvent(
    matchId: number,
    dto: CreateManualMatchEventDto,
  ): Promise<MatchEventEntity> {
    const allowedTypes = new Set<MatchEventType>([
      MatchEventType.GOAL,
      MatchEventType.OWN_GOAL,
      MatchEventType.YELLOW_CARD,
      MatchEventType.SECOND_YELLOW_CARD,
      MatchEventType.RED_CARD,
      MatchEventType.RED_BALL,
    ]);

    if (!allowedTypes.has(dto.eventType)) {
      throw new BadRequestException('Недопустимый тип события');
    }

    const match = await this.matchRepository.findOne({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException('Матч не найден');
    }

    if (match.status !== MatchStatus.SCHEDULED) {
      throw new BadRequestException(
        'Протокол уже подписан, редактирование невозможно',
      );
    }

    if (match.homeTeamId !== dto.teamId && match.awayTeamId !== dto.teamId) {
      throw new BadRequestException('Команда не участвует в этом матче');
    }

    if (dto.eventType !== MatchEventType.RED_BALL && !dto.playerId) {
      throw new BadRequestException('Необходимо указать автора события');
    }

    if (dto.assistPlayerId && dto.eventType !== MatchEventType.GOAL) {
      throw new BadRequestException(
        'Ассистент может быть указан только для гола',
      );
    }

    if (dto.playerId && dto.playerId === dto.assistPlayerId) {
      throw new BadRequestException('Автор и ассистент не могут совпадать');
    }

    const participantIds = [dto.playerId, dto.assistPlayerId].filter(
      (id): id is number => Boolean(id),
    );

    if (participantIds.length) {
      const teamPlayersCount = await this.teamPlayerRepository
        .createQueryBuilder('teamPlayer')
        .where('teamPlayer.team_id = :teamId', { teamId: dto.teamId })
        .andWhere('teamPlayer.player_id IN (:...participantIds)', {
          participantIds,
        })
        .andWhere('teamPlayer.isActive = true')
        .getCount();

      if (teamPlayersCount !== participantIds.length) {
        throw new BadRequestException(
          'Игрок не входит в состав выбранной команды',
        );
      }
    }

    const event = this.matchEventRepository.create({
      matchId,
      teamId: dto.teamId,
      eventType: dto.eventType,
      minute: dto.minute,
      half: dto.half,
      playerId: dto.playerId,
      assistPlayerId: dto.assistPlayerId,
      isCancelled: false,
    });

    const savedEvent = await this.matchEventRepository.save(event);
    if (savedEvent.playerId) {
      await this.playerTournamentStatsService.applyCardEvent({
        match,
        teamId: savedEvent.teamId,
        playerId: savedEvent.playerId,
        eventType: savedEvent.eventType,
      });
    }
    return savedEvent;
  }

  async cancelManualEvent(
    matchId: number,
    eventId: number,
  ): Promise<{ id: number; isCancelled: true }> {
    const match = await this.matchRepository.findOne({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Матч не найден');
    }
    if (match.status !== MatchStatus.SCHEDULED) {
      throw new BadRequestException(
        'Протокол уже подписан, редактирование невозможно',
      );
    }

    const event = await this.matchEventRepository.findOne({
      where: { id: eventId, matchId, isCancelled: false },
    });
    if (!event) {
      throw new NotFoundException('Событие матча не найдено');
    }

    event.isCancelled = true;
    await this.matchEventRepository.save(event);
    if (event.playerId) {
      await this.playerTournamentStatsService.revertCardEvent({
        match,
        teamId: event.teamId,
        playerId: event.playerId,
        eventType: event.eventType,
      });
    }
    return { id: event.id, isCancelled: true };
  }

  async signManualProtocol(
    matchId: number,
    dto: FinalizeMatchResultDto = {},
  ): Promise<{
    matchId: number;
    status: MatchStatus;
    homeScore: number;
    awayScore: number;
    winnerTeamId?: number;
    resolutionType?: MatchResolutionType;
    technicalResultReason?: string;
  }> {
    let tournamentId: number | undefined;
    const result = await this.dataSource.transaction(async (manager) => {
      const matchRepository = manager.getRepository(MatchEntity);
      const eventRepository = manager.getRepository(MatchEventEntity);
      const match = await matchRepository.findOne({ where: { id: matchId } });

      if (!match) {
        throw new NotFoundException('Матч не найден');
      }

      if (match.status !== MatchStatus.SCHEDULED) {
        throw new BadRequestException('Протокол уже подписан');
      }

      const isTechnicalResult =
        dto.resolutionType === MatchResolutionType.TECHNICAL;

      if (isTechnicalResult) {
        const reason = dto.technicalResultReason?.trim();
        if (!reason) {
          throw new BadRequestException(
            'Укажите причину технического поражения',
          );
        }
        if (reason.length > 1000) {
          throw new BadRequestException(
            'Причина не должна превышать 1000 символов',
          );
        }
        if (
          dto.winnerTeamId !== match.homeTeamId &&
          dto.winnerTeamId !== match.awayTeamId
        ) {
          throw new BadRequestException(
            'Победителем должна быть одна из команд матча',
          );
        }

        dto = {
          ...dto,
          regularTime:
            dto.winnerTeamId === match.homeTeamId
              ? { home: 3, away: 0 }
              : { home: 0, away: 3 },
          technicalResultReason: reason,
        };
      }

      if (!isTechnicalResult) {
        const rosterRepository = manager.getRepository(MatchRosterEntity);
        const rosterPlayerRepository = manager.getRepository(
          MatchRosterPlayerEntity,
        );
        const rosters = await rosterRepository.find({ where: { matchId } });
        const rosterByTeamId = new Map(
          rosters.map((roster) => [roster.teamId, roster]),
        );

        for (const teamId of [match.homeTeamId, match.awayTeamId]) {
          const roster = rosterByTeamId.get(teamId);
          if (!roster?.isSubmitted) {
            throw new BadRequestException(
              'Перед подписанием протокола сформируйте заявки обеих команд',
            );
          }

          const playersCount = await rosterPlayerRepository.count({
            where: { matchRosterId: roster.id },
          });
          if (playersCount < 5) {
            throw new BadRequestException(
              'В заявке каждой команды должно быть минимум 5 игроков',
            );
          }

          roster.isApproved = true;
          roster.approvedAt ??= new Date();
          await rosterRepository.save(roster);
        }
      }

      const scoringEvents = await eventRepository.find({
        where: {
          matchId,
          eventType: In([
            MatchEventType.GOAL,
            MatchEventType.OWN_GOAL,
          ]),
          isCancelled: false,
        },
      });

      const homeScore = scoringEvents.filter(
        (event) =>
          (event.eventType === MatchEventType.GOAL &&
            event.teamId === match.homeTeamId) ||
          (event.eventType === MatchEventType.OWN_GOAL &&
            event.teamId === match.awayTeamId),
      ).length;
      const awayScore = scoringEvents.filter(
        (event) =>
          (event.eventType === MatchEventType.GOAL &&
            event.teamId === match.awayTeamId) ||
          (event.eventType === MatchEventType.OWN_GOAL &&
            event.teamId === match.homeTeamId),
      ).length;
      await this.applyOfficialResult(
        match,
        { home: homeScore, away: awayScore },
        dto,
        manager,
      );
      await matchRepository.save(match);
      tournamentId = match.tournamentId;

      return {
        matchId: match.id,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        winnerTeamId: match.winnerTeamId,
        resolutionType: match.resolutionType,
        technicalResultReason: match.technicalResultReason,
      };
    });
    if (tournamentId) {
      await this.tournamentLifecycleService.markInProgress(tournamentId);
      await this.knockoutBracketService.advanceAutomatically(
        tournamentId,
        matchId,
      );
    }
    return result;
  }

  async findRegistrationMatches(
    currentUserId: number,
  ): Promise<MatchServiceMatchDto[]> {
    const user = await this.usersService.findById(currentUserId);
    const roles = user?.roles?.map((role) => role.code) ?? [];
    const canManageAllTeams =
      roles.includes(RoleCode.Admin) || roles.includes(RoleCode.SuperAdmin);

    const query = this.matchRepository
      .createQueryBuilder('match')
      .innerJoinAndSelect('match.homeTeam', 'homeTeam')
      .innerJoinAndSelect('match.awayTeam', 'awayTeam')
      .leftJoinAndSelect('match.venue', 'venue')
      .innerJoinAndSelect('match.tournament', 'tournament')
      .where('match.status = :status', { status: MatchStatus.SCHEDULED })
      .andWhere('match.match_datetime >= :now', { now: new Date() })
      .orderBy('match.match_datetime', 'ASC')
      .addOrderBy('match.id', 'ASC');

    if (!canManageAllTeams) {
      const captainLinks = await this.teamPlayerRepository
        .createQueryBuilder('teamPlayer')
        .innerJoin('teamPlayer.player', 'player')
        .where('player.user_id = :currentUserId', { currentUserId })
        .andWhere('"teamPlayer"."isCaptain" = :isCaptain', { isCaptain: true })
        .andWhere('"teamPlayer"."isActive" = :isActive', { isActive: true })
        .getMany();
      const teamIds = captainLinks.map((link) => link.teamId);

      if (teamIds.length === 0) {
        return [];
      }

      query.andWhere(
        new Brackets((builder) => {
          builder
            .where('match.home_team_id IN (:...teamIds)', { teamIds })
            .orWhere('match.away_team_id IN (:...teamIds)', { teamIds });
        }),
      );
    }

    const matches = await query.getMany();

    return matches.map((match) => this.toDto(match));
  }

  async getMatchRegistration(
    matchId: number,
    teamId: number,
    currentUserId: number,
  ) {
    const match = await this.findRegistrationMatch(matchId, teamId);
    await this.ensureCanManageRegistrationTeam(teamId, currentUserId);

    const [players, roster] = await Promise.all([
      this.findTeamRoster(match, teamId),
      this.matchRosterRepository.findOne({ where: { matchId, teamId } }),
    ]);
    const selectedPlayers = roster
      ? await this.matchRosterPlayerRepository.find({
          where: { matchRosterId: roster.id },
        })
      : [];
    const selectedTeamPlayerIds = new Set(
      selectedPlayers.map((player) => player.teamPlayerId),
    );
    const team = teamId === match.homeTeamId ? match.homeTeam : match.awayTeam;

    return {
      match: this.toDto(match),
      team: {
        id: team.id,
        name: team.name,
        logoUrl: team.logoUrl,
      },
      isApproved: roster?.isSubmitted ?? false,
      players: players.map((player) => ({
        ...player,
        isSelected: selectedTeamPlayerIds.has(player.teamPlayerId),
      })),
    };
  }

  async saveMatchRegistration(
    matchId: number,
    teamId: number,
    teamPlayerIds: number[],
    currentUserId: number,
    allowSubmittedRosterChanges = false,
  ) {
    const match = await this.findRegistrationMatch(matchId, teamId);
    await this.ensureCanManageRegistrationTeam(teamId, currentUserId);

    if (new Set(teamPlayerIds).size !== teamPlayerIds.length) {
      throw new BadRequestException('Игрок не может быть добавлен дважды');
    }

    const availablePlayers = await this.findTeamRoster(match, teamId);
    const playersByTeamPlayerId = new Map(
      availablePlayers.map((player) => [player.teamPlayerId, player]),
    );
    const selectedPlayers = teamPlayerIds.map((id) =>
      playersByTeamPlayerId.get(id),
    );

    if (selectedPlayers.some((player) => !player)) {
      throw new BadRequestException(
        'В заявке есть игрок, который не состоит в команде',
      );
    }

    const suspendedPlayer = selectedPlayers.find(
      (player) => player?.eligibilityStatus === 'not_allowed',
    );

    if (suspendedPlayer) {
      throw new BadRequestException(
        `Игрок ${suspendedPlayer.lastName} ${suspendedPlayer.firstName} дисквалифицирован на этот матч`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const rosterRepository = manager.getRepository(MatchRosterEntity);
      const rosterPlayerRepository = manager.getRepository(
        MatchRosterPlayerEntity,
      );
      let roster = await rosterRepository.findOne({
        where: { matchId, teamId },
      });

      if (roster?.isSubmitted && !allowSubmittedRosterChanges) {
        throw new BadRequestException(
          'Утверждённую заявку нельзя редактировать',
        );
      }

      if (!roster) {
        roster = await rosterRepository.save(
          rosterRepository.create({ matchId, teamId, isApproved: false }),
        );
      }

      await rosterPlayerRepository.delete({ matchRosterId: roster.id });

      if (selectedPlayers.length > 0) {
        await rosterPlayerRepository.save(
          selectedPlayers.map((player) =>
            rosterPlayerRepository.create({
              matchRosterId: roster!.id,
              playerId: player!.id,
              teamPlayerId: player!.teamPlayerId,
              shirtNumber: player!.shirtNumber,
              position: player!.position,
              isCaptain: player!.isCaptain,
              wasAllowed: player!.eligibilityStatus === 'allowed',
            }),
          ),
        );
      }
    });

    return this.getMatchRegistration(matchId, teamId, currentUserId);
  }

  async saveMatchRegistrationByOfficial(
    matchId: number,
    teamId: number,
    teamPlayerIds: number[],
    currentUserId: number,
  ) {
    if (teamPlayerIds.length < 5) {
      throw new BadRequestException(
        'В составе команды должно быть минимум 5 игроков',
      );
    }

    const roster = await this.matchRosterRepository.findOne({
      where: { matchId, teamId },
    });

    if (!roster?.isSubmitted) {
      throw new BadRequestException(
        'Капитан ещё не утвердил заявку команды',
      );
    }

    return this.saveMatchRegistration(
      matchId,
      teamId,
      teamPlayerIds,
      currentUserId,
      true,
    );
  }

  async approveMatchRegistration(
    matchId: number,
    teamId: number,
    currentUserId: number,
  ) {
    await this.findRegistrationMatch(matchId, teamId);
    await this.ensureCanManageRegistrationTeam(teamId, currentUserId);
    const roster = await this.matchRosterRepository.findOne({
      where: { matchId, teamId },
    });

    if (!roster) {
      throw new BadRequestException('Сначала сохраните заявку');
    }

    if (!roster.isSubmitted) {
      const rosterPlayers = await this.matchRosterPlayerRepository.find({
        where: { matchRosterId: roster.id },
      });

      if (rosterPlayers.length < 5) {
        throw new BadRequestException(
          'Для утверждения заявки необходимо выбрать минимум 5 игроков',
        );
      }

      const match = await this.findRegistrationMatch(matchId, teamId);
      const availablePlayers = await this.findTeamRoster(match, teamId);
      const eligibilityByTeamPlayerId = new Map(
        availablePlayers.map((player) => [player.teamPlayerId, player]),
      );
      const suspendedPlayer = rosterPlayers
        .map((player) => eligibilityByTeamPlayerId.get(player.teamPlayerId!))
        .find((player) => player?.eligibilityStatus === 'not_allowed');

      if (suspendedPlayer) {
        throw new BadRequestException(
          `Игрок ${suspendedPlayer.lastName} ${suspendedPlayer.firstName} дисквалифицирован на этот матч`,
        );
      }

      roster.isSubmitted = true;
      roster.submittedAt = new Date();
      roster.submittedByUserId = currentUserId;
      await this.matchRosterRepository.save(roster);
    }

    const currentUser = await this.usersService.findById(currentUserId);
    const currentUserRoles = currentUser?.roles?.map((role) => role.code) ?? [];
    const canApproveRoster =
      currentUserRoles.includes(RoleCode.Referee) ||
      currentUserRoles.includes(RoleCode.Admin) ||
      currentUserRoles.includes(RoleCode.SuperAdmin);

    if (canApproveRoster && !roster.isApproved) {
      roster.isApproved = true;
      roster.approvedAt = new Date();
      roster.approvedByUserId = currentUserId;
      await this.matchRosterRepository.save(roster);
    }

    return this.getMatchRegistration(matchId, teamId, currentUserId);
  }

  private async findRegistrationMatch(
    matchId: number,
    teamId: number,
  ): Promise<MatchEntity> {
    const match = await this.matchRepository.findOne({
      where: { id: matchId, status: MatchStatus.SCHEDULED },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        tournament: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Предстоящий матч не найден');
    }

    if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) {
      throw new BadRequestException('Команда не участвует в этом матче');
    }

    return match;
  }

  private async ensureCanManageRegistrationTeam(
    teamId: number,
    currentUserId: number,
  ): Promise<void> {
    const user = await this.usersService.findById(currentUserId);
    const roles = user?.roles?.map((role) => role.code) ?? [];

    if (
      roles.includes(RoleCode.Admin) ||
      roles.includes(RoleCode.SuperAdmin) ||
      roles.includes(RoleCode.Referee)
    ) {
      return;
    }

    const captainLink = await this.teamPlayerRepository
      .createQueryBuilder('teamPlayer')
      .innerJoin('teamPlayer.player', 'player')
      .where('teamPlayer.team_id = :teamId', { teamId })
      .andWhere('player.user_id = :currentUserId', { currentUserId })
      .andWhere('"teamPlayer"."isCaptain" = :isCaptain', { isCaptain: true })
      .andWhere('"teamPlayer"."isActive" = :isActive', { isActive: true })
      .getOne();

    if (!captainLink) {
      throw new BadRequestException(
        'Нет прав на управление заявкой этой команды',
      );
    }
  }

  private toDto(match: MatchEntity): MatchServiceMatchDto {
    return {
      id: match.id,
      tournamentId: match.tournamentId,
      round: match.round,
      matchDatetime: formatLocalDateTime(match.matchDatetime) ?? undefined,
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,

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

  private async findFinishedMatch(
    matchId: number,
    teamId?: number,
  ): Promise<MatchEntity> {
    const match = await this.matchRepository.findOne({
      where: { id: matchId, status: MatchStatus.FINISHED },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        tournament: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Завершённый матч не найден');
    }
    if (teamId !== undefined) {
      this.assertTeamParticipates(match, teamId);
    }

    return match;
  }

  private assertTeamParticipates(match: MatchEntity, teamId: number): void {
    if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) {
      throw new BadRequestException('Команда не участвует в этом матче');
    }
  }

  private async assertCorrectionEventParticipants(
    matchId: number,
    dto: CreateManualMatchEventDto,
  ): Promise<void> {
    if (dto.eventType !== MatchEventType.RED_BALL && !dto.playerId) {
      throw new BadRequestException('Необходимо указать автора события');
    }
    if (
      dto.assistPlayerId &&
      dto.eventType !== MatchEventType.GOAL &&
      dto.eventType !== MatchEventType.PENALTY_GOAL
    ) {
      throw new BadRequestException(
        'Ассистент может быть указан только для гола',
      );
    }
    if (dto.playerId && dto.playerId === dto.assistPlayerId) {
      throw new BadRequestException('Автор и ассистент не могут совпадать');
    }

    const participantIds = [dto.playerId, dto.assistPlayerId].filter(
      (id): id is number => Boolean(id),
    );
    if (!participantIds.length) return;

    const roster = await this.matchRosterRepository.findOne({
      where: { matchId, teamId: dto.teamId },
    });
    if (!roster) {
      throw new BadRequestException('Состав команды на матч не найден');
    }

    const rosterPlayersCount = await this.matchRosterPlayerRepository.count({
      where: {
        matchRosterId: roster.id,
        playerId: In(participantIds),
      },
    });
    if (rosterPlayersCount !== participantIds.length) {
      throw new BadRequestException(
        'Автор события должен входить в протокол участников матча',
      );
    }
  }

  private assertFinishedScoringCorrectionAllowed(
    match: MatchEntity,
    eventType: MatchEventType,
  ): void {
    if (
      this.isScoringEvent(eventType) &&
      match.resolutionType &&
      match.resolutionType !== MatchResolutionType.REGULAR_TIME
    ) {
      throw new BadRequestException(
        'Счёт матчей с дополнительным временем, пенальти или техническим результатом нельзя менять через обычные события',
      );
    }
  }

  private isScoringEvent(eventType: MatchEventType): boolean {
    return [
      MatchEventType.GOAL,
      MatchEventType.OWN_GOAL,
      MatchEventType.PENALTY_GOAL,
    ].includes(eventType);
  }

  private async recalculateCorrectedMatchScore(
    match: MatchEntity,
    manager: EntityManager,
  ): Promise<void> {
    const events = await manager.getRepository(MatchEventEntity).find({
      where: {
        matchId: match.id,
        eventType: In([
          MatchEventType.GOAL,
          MatchEventType.OWN_GOAL,
          MatchEventType.PENALTY_GOAL,
        ]),
        isCancelled: false,
      },
    });
    let home = 0;
    let away = 0;

    for (const event of events) {
      const value = event.goalValue || 1;
      const isOwnGoal = event.eventType === MatchEventType.OWN_GOAL;
      const scoresForHome = isOwnGoal
        ? event.teamId === match.awayTeamId
        : event.teamId === match.homeTeamId;
      scoresForHome ? (home += value) : (away += value);
    }

    const previousWinnerTeamId = match.winnerTeamId;
    await this.applyOfficialResult(
      match,
      { home, away },
      { resolutionType: MatchResolutionType.REGULAR_TIME },
      manager,
    );
    if (
      match.bracketSnapshotId &&
      previousWinnerTeamId !== match.winnerTeamId
    ) {
      throw new BadRequestException(
        'Нельзя изменить победителя уже продвинутого матча плей-офф',
      );
    }
    await manager.getRepository(MatchEntity).save(match);
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

    const [statsByPlayerId, disciplineByPlayerId] = await Promise.all([
      this.getStatsByPlayerIds(match.tournamentId, teamId, playerIds),
      this.playerSuspensionsService.getEligibilityForMatch(
        match,
        teamId,
        playerIds,
      ),
    ]);

    return teamPlayers.map((teamPlayer) => {
      const stat = statsByPlayerId.get(teamPlayer.playerId);
      const discipline = disciplineByPlayerId.get(teamPlayer.playerId);

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

        eligibilityStatus: this.getEligibilityStatus(discipline),
        eligibilityReason: this.getEligibilityReason(discipline),
      };
    });
  }

  private async findSubmittedTeamRoster(
    match: MatchEntity,
    roster: MatchRosterEntity,
  ): Promise<MatchRosterPlayerDto[]> {
    const rosterPlayers = await this.matchRosterPlayerRepository.find({
      where: { matchRosterId: roster.id },
      relations: { player: true },
      order: { shirtNumber: 'ASC', id: 'ASC' },
    });
    const playerIds = rosterPlayers.map((player) => player.playerId);
    const [statsByPlayerId, disciplineByPlayerId] = await Promise.all([
      this.getStatsByPlayerIds(match.tournamentId, roster.teamId, playerIds),
      this.playerSuspensionsService.getEligibilityForMatch(
        match,
        roster.teamId,
        playerIds,
      ),
    ]);

    return rosterPlayers.map((rosterPlayer) => {
      const stat = statsByPlayerId.get(rosterPlayer.playerId);
      const discipline = disciplineByPlayerId.get(rosterPlayer.playerId);

      return {
        id: rosterPlayer.playerId,
        teamPlayerId: rosterPlayer.teamPlayerId!,
        firstName: rosterPlayer.player.firstName,
        lastName: rosterPlayer.player.lastName,
        middleName: rosterPlayer.player.middleName,
        photoUrl: rosterPlayer.player.photoUrl,
        shirtNumber: rosterPlayer.shirtNumber,
        position: rosterPlayer.position ?? rosterPlayer.player.position,
        isCaptain: rosterPlayer.isCaptain,
        yellowCards: stat?.yellowCards ?? 0,
        redCards: stat?.redCards ?? 0,
        secondYellowCards: stat?.secondYellowCards ?? 0,
        eligibilityStatus: this.getEligibilityStatus(discipline),
        eligibilityReason: this.getEligibilityReason(discipline),
      };
    });
  }

  async getRosterCheck(matchId: number): Promise<MatchRosterCheckDto> {
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

    const savedRosters = await this.matchRosterRepository.find({
      where: { matchId: match.id },
    });
    const savedRosterByTeamId = new Map(
      savedRosters.map((roster) => [roster.teamId, roster]),
    );
    const homeSavedRoster = savedRosterByTeamId.get(match.homeTeamId);
    const awaySavedRoster = savedRosterByTeamId.get(match.awayTeamId);
    const [homeRoster, awayRoster] = await Promise.all([
      homeSavedRoster?.isSubmitted
        ? this.findSubmittedTeamRoster(match, homeSavedRoster)
        : this.findTeamRoster(match, match.homeTeamId),
      awaySavedRoster?.isSubmitted
        ? this.findSubmittedTeamRoster(match, awaySavedRoster)
        : this.findTeamRoster(match, match.awayTeamId),
    ]);

    return {
      match: {
        id: match.id,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        resolutionType: match.resolutionType,
        technicalResultReason: match.technicalResultReason,
        matchDatetime: match.matchDatetime,
        venueName: match.venue?.name,

        homeTeam: {
          id: match.homeTeam.id,
          name: match.homeTeam.name,
          logoUrl: match.homeTeam.logoUrl,
          rosterApproved: homeSavedRoster?.isApproved ?? false,
        },

        awayTeam: {
          id: match.awayTeam.id,
          name: match.awayTeam.name,
          logoUrl: match.awayTeam.logoUrl,
          rosterApproved: awaySavedRoster?.isApproved ?? false,
        },
      },

      warnings: this.buildWarnings([...homeRoster, ...awayRoster]),

      homeRoster,
      awayRoster,
    };
  }

  async syncEvents(matchId: number, dto: SyncMatchServiceEventsDto) {
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
    discipline: PlayerDisciplineEligibility | undefined,
  ): PlayerEligibilityStatus {
    if (discipline?.suspension) return 'not_allowed';
    if (
      discipline?.yellowWarningThreshold !== undefined &&
      discipline.yellowCardsInScope === discipline.yellowWarningThreshold
    ) {
      return 'check';
    }
    return 'allowed';
  }

  private getEligibilityReason(
    discipline: PlayerDisciplineEligibility | undefined,
  ): PlayerEligibilityReason {
    if (
      discipline?.suspension?.reason ===
      PlayerSuspensionReason.ACCUMULATED_YELLOWS
    ) {
      return 'accumulated_yellows_suspension';
    }
    if (discipline?.suspension?.reason === PlayerSuspensionReason.DIRECT_RED) {
      return 'red_card_suspension';
    }
    if (
      discipline?.suspension?.reason ===
      PlayerSuspensionReason.SECOND_YELLOW_CARD
    ) {
      return 'second_yellow_suspension';
    }
    if (
      discipline?.yellowWarningThreshold !== undefined &&
      discipline.yellowCardsInScope === discipline.yellowWarningThreshold
    ) {
      return 'yellow_card_threshold_warning';
    }
    return 'none';
  }

  async approveRoster(
    matchId: number,
    teamId: number,
  ): Promise<MatchRosterCheckDto> {
    await this.dataSource.transaction(async (manager) => {
      const matchRosterRepository = manager.getRepository(MatchRosterEntity);
      const matchRosterPlayerRepository = manager.getRepository(
        MatchRosterPlayerEntity,
      );
      const teamPlayerRepository = manager.getRepository(TeamPlayerEntity);

      let roster = await matchRosterRepository.findOne({
        where: {
          matchId,
          teamId,
        },
      });

      if (!roster) {
        roster = matchRosterRepository.create({
          matchId,
          teamId,
          isApproved: false,
        });

        roster = await matchRosterRepository.save(roster);
      }

      if (roster.isSubmitted) {
        const submittedPlayersCount = await matchRosterPlayerRepository.count({
          where: { matchRosterId: roster.id },
        });

        if (submittedPlayersCount === 0) {
          throw new BadRequestException('Нельзя утвердить пустую заявку');
        }

        roster.isApproved = true;
        roster.approvedAt = new Date();
        await matchRosterRepository.save(roster);
        return;
      }

      await matchRosterPlayerRepository.delete({
        matchRosterId: roster.id,
      });

      const teamPlayers = await teamPlayerRepository.find({
        where: {
          teamId,
          isActive: true,
        },
      });

      if (teamPlayers.length === 0) {
        throw new BadRequestException(
          'Нельзя утвердить состав: в команде нет активных игроков',
        );
      }

      const rosterPlayers = teamPlayers.map((teamPlayer) =>
        matchRosterPlayerRepository.create({
          matchRosterId: roster.id,
          playerId: teamPlayer.playerId,
          teamPlayerId: teamPlayer.id,
          shirtNumber: teamPlayer.shirtNumber,
          position: teamPlayer.position,
          isCaptain: teamPlayer.isCaptain,
          wasAllowed: true,
        }),
      );

      await matchRosterPlayerRepository.save(rosterPlayers);

      roster.isApproved = true;
      roster.approvedAt = new Date();

      await matchRosterRepository.save(roster);
    });

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

    return new Map(rosters.map((roster) => [roster.teamId, roster]));
  }

  private buildWarnings(
    players: MatchRosterPlayerDto[],
  ): MatchRosterWarningsDto {
    const playersToCheckCount = players.filter(
      (player) => player.eligibilityStatus === 'check',
    ).length;

    const yellowCardsSuspensionCount = players.filter(
      (player) =>
        player.eligibilityReason === 'four_yellows_suspension' ||
        player.eligibilityReason === 'accumulated_yellows_suspension',
    ).length;

    const redCardSuspensionCount = players.filter(
      (player) =>
        player.eligibilityReason === 'red_card_suspension' ||
        player.eligibilityReason === 'second_yellow_suspension',
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

  private async syncExpiredRedBalls(
    match: MatchEntity,
    session: MatchServiceSessionEntity,
  ): Promise<void> {
    const currentSecond = this.getCurrentElapsedSeconds(session);

    await this.completeExpiredRedBalls(
      match.id,
      currentSecond,
      session.currentHalf,
    );
  }

  async getSession(matchId: number): Promise<MatchServiceSessionDto> {
    const match = await this.findMatchForService(matchId);

    await this.assertBothRostersApproved(match);

    const session = await this.getOrCreateSession(match);

    await this.syncExpiredRedBalls(match, session);

    const [rosters, events, redBalls] = await Promise.all([
      this.getApprovedRosterPlayers(match),
      this.getMatchEvents(match.id),
      this.getRedBallState(match.id),
    ]);

    return {
      match: {
        id: match.id,
        tournamentId: match.tournamentId,
        round: match.round,
        status: match.status,
        matchDatetime: match.matchDatetime,
        result: this.mapMatchResult(match),

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

      redBalls,
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

  private mapMatchResult(match: MatchEntity) {
    const hasExtraTime =
      match.extraTimeHomeScore !== null &&
      match.extraTimeHomeScore !== undefined &&
      match.extraTimeAwayScore !== null &&
      match.extraTimeAwayScore !== undefined;
    const hasPenalties =
      match.penaltyHomeScore !== null &&
      match.penaltyHomeScore !== undefined &&
      match.penaltyAwayScore !== null &&
      match.penaltyAwayScore !== undefined &&
      match.penaltyHomeKicksTaken !== null &&
      match.penaltyHomeKicksTaken !== undefined &&
      match.penaltyAwayKicksTaken !== null &&
      match.penaltyAwayKicksTaken !== undefined;
    return {
      regularTime: {
        home: match.regularTimeHomeScore ?? match.homeScore,
        away: match.regularTimeAwayScore ?? match.awayScore,
      },
      extraTime: hasExtraTime
        ? {
            home: match.extraTimeHomeScore!,
            away: match.extraTimeAwayScore!,
          }
        : undefined,
      penalties: hasPenalties
        ? {
            home: match.penaltyHomeScore!,
            away: match.penaltyAwayScore!,
            homeKicksTaken: match.penaltyHomeKicksTaken!,
            awayKicksTaken: match.penaltyAwayKicksTaken!,
          }
        : undefined,
      resolutionType: match.resolutionType,
      winnerTeamId: match.winnerTeamId,
      officialAt: match.resultOfficialAt,
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
      throw new BadRequestException(
        'Поставить на паузу можно только идущий тайм',
      );
    }

    this.applyElapsedTime(session);

    await this.completeExpiredRedBalls(
      match.id,
      session.elapsedSeconds,
      session.currentHalf,
    );

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

  async finishHalf(matchId: number, dto: FinalizeMatchResultDto = {}) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    if (
      session.status !== MatchServiceStatus.FIRST_HALF &&
      session.status !== MatchServiceStatus.SECOND_HALF
    ) {
      throw new BadRequestException('Завершить можно только идущий тайм');
    }

    this.applyElapsedTime(session);

    await this.completeExpiredRedBalls(
      match.id,
      session.elapsedSeconds,
      session.currentHalf,
    );

    session.startedAt = null;
    session.pausedAt = null;
    session.previousStatus = null;

    if (session.status === MatchServiceStatus.FIRST_HALF) {
      session.status = MatchServiceStatus.HALF_TIME;
      session.currentHalf = 1;
    } else {
      await this.applyOfficialResult(
        match,
        { home: session.homeScore, away: session.awayScore },
        dto,
      );
      session.status = MatchServiceStatus.FINISHED;
      session.finishedAt = new Date();

      await this.matchRepository.save(match);
      await this.tournamentLifecycleService.markInProgress(match.tournamentId);
      await this.knockoutBracketService.advanceAutomatically(
        match.tournamentId,
        match.id,
      );
      await this.playerTournamentStatsService.serveSuspensionsForMatch(
        match.id,
      );
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

  async signProtocol(matchId: number) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    if (session.status !== MatchServiceStatus.FINISHED) {
      throw new BadRequestException(
        'Подписать протокол можно только после завершения матча',
      );
    }

    session.status = MatchServiceStatus.PROTOCOL_SIGNED;
    session.previousStatus = null;
    session.startedAt = null;
    session.pausedAt = null;

    const savedSession = await this.matchServiceSessionRepository.save(session);

    await this.createSystemEvent({
      match,
      session: savedSession,
      eventType: MatchEventType.PROTOCOL_SIGNED,
      description: 'Протокол матча подписан',
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

  async finishMatch(matchId: number, dto: FinalizeMatchResultDto = {}) {
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

    await this.completeExpiredRedBalls(
      match.id,
      session.elapsedSeconds,
      session.currentHalf,
    );

    await this.applyOfficialResult(
      match,
      { home: session.homeScore, away: session.awayScore },
      dto,
    );

    session.status = MatchServiceStatus.FINISHED;
    session.previousStatus = null;
    session.startedAt = null;
    session.pausedAt = null;
    session.finishedAt = new Date();

    const savedSession = await this.matchServiceSessionRepository.save(session);
    await this.matchRepository.save(match);
    await this.tournamentLifecycleService.markInProgress(match.tournamentId);
    await this.knockoutBracketService.advanceAutomatically(
      match.tournamentId,
      match.id,
    );
    await this.playerTournamentStatsService.serveSuspensionsForMatch(match.id);

    await this.createSystemEvent({
      match,
      session: savedSession,
      eventType: MatchEventType.MATCH_FINISHED,
      description: 'Матч завершён',
    });

    return this.mapSession(savedSession);
  }

  async startEventRecording(matchId: number, dto: StartEventRecordingDto) {
    const match = await this.findMatchForService(matchId);

    await this.assertBothRostersApproved(match);

    const session = await this.getOrCreateSession(match);

    await this.syncExpiredRedBalls(match, session);

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

  async createEvent(matchId: number, dto: CreateMatchServiceEventDto) {
    const match = await this.findMatchForService(matchId);

    await this.assertBothRostersApproved(match);

    const session = await this.getOrCreateSession(match);

    await this.syncExpiredRedBalls(match, session);

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
          redBalls: await this.getRedBallState(matchId),
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

    const goalValue = await this.getGoalValue({
      matchId,
      eventType: dto.eventType,
      goalSecond: second,
    });

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
      goalValue,
      isCancelled: false,
    });

    const savedEvent = await this.matchEventRepository.save(event);

    await this.applyScoreByEvent({
      match,
      session,
      event: savedEvent,
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
      redBalls: await this.getRedBallState(matchId),
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

  private async applyScoreByEvent(params: {
    match: MatchEntity;
    session: MatchServiceSessionEntity;
    event: MatchEventEntity;
  }): Promise<void> {
    const { match, session, event } = params;

    if (
      event.eventType !== MatchEventType.GOAL &&
      event.eventType !== MatchEventType.OWN_GOAL
    ) {
      return;
    }

    const goalValue = event.goalValue ?? 1;

    if (event.eventType === MatchEventType.GOAL) {
      if (event.teamId === match.homeTeamId) {
        session.homeScore += goalValue;
      } else {
        session.awayScore += goalValue;
      }
    }

    if (event.eventType === MatchEventType.OWN_GOAL) {
      if (event.teamId === match.homeTeamId) {
        session.awayScore += goalValue;
      } else {
        session.homeScore += goalValue;
      }
    }

    const activeRedBall = await this.findActiveRedBallForSecond({
      matchId: match.id,
      second: event.second ?? session.elapsedSeconds,
    });

    if (
      activeRedBall &&
      event.eventType === MatchEventType.GOAL &&
      event.teamId === activeRedBall.teamId
    ) {
      activeRedBall.status = RedBallStatus.COMPLETED_BY_GOAL;
      activeRedBall.completedHalf = event.half ?? session.currentHalf;
      activeRedBall.completedSecond = event.second ?? session.elapsedSeconds;
      activeRedBall.completedByEventId = event.id;

      await this.matchRedBallRepository.save(activeRedBall);
    }
  }

  private async findActiveRedBallForSecond(params: {
    matchId: number;
    second: number;
  }): Promise<MatchRedBallActivationEntity | null> {
    const activeRedBalls = await this.matchRedBallRepository.find({
      where: {
        matchId: params.matchId,
        status: RedBallStatus.ACTIVE,
      },
    });

    return (
      activeRedBalls.find((redBall) => {
        const start = redBall.activatedSecond;
        const end = redBall.activatedSecond + redBall.durationSeconds;

        return params.second >= start && params.second <= end;
      }) ?? null
    );
  }

  private async completeExpiredRedBalls(
    matchId: number,
    currentSecond: number,
    currentHalf: number,
  ): Promise<void> {
    const activeRedBalls = await this.matchRedBallRepository.find({
      where: {
        matchId,
        status: RedBallStatus.ACTIVE,
      },
    });

    for (const redBall of activeRedBalls) {
      const expired =
        currentHalf > redBall.activatedHalf ||
        currentSecond >= redBall.activatedSecond + redBall.durationSeconds;

      if (!expired) {
        continue;
      }

      redBall.status = RedBallStatus.COMPLETED_BY_TIME;
      redBall.completedHalf = currentHalf;
      redBall.completedSecond = currentSecond;

      await this.matchRedBallRepository.save(redBall);
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

    if (
      event.eventType !== MatchEventType.GOAL &&
      event.eventType !== MatchEventType.OWN_GOAL
    ) {
      return;
    }

    const goalValue = event.goalValue ?? 1;

    if (event.eventType === MatchEventType.GOAL) {
      if (event.teamId === match.homeTeamId) {
        session.homeScore = Math.max(session.homeScore - goalValue, 0);
      } else {
        session.awayScore = Math.max(session.awayScore - goalValue, 0);
      }
    }

    if (event.eventType === MatchEventType.OWN_GOAL) {
      if (event.teamId === match.homeTeamId) {
        session.awayScore = Math.max(session.awayScore - goalValue, 0);
      } else {
        session.homeScore = Math.max(session.homeScore - goalValue, 0);
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

    await this.restoreRedBallIfGoalCancelled({
      match,
      session,
      event,
    });

    const savedEvent = await this.matchEventRepository.save(event);
    const savedSession = await this.matchServiceSessionRepository.save(session);
    if (savedEvent.playerId) {
      await this.playerTournamentStatsService.revertCardEvent({
        match,
        teamId: savedEvent.teamId,
        playerId: savedEvent.playerId,
        eventType: savedEvent.eventType,
      });
    }

    return {
      cancelledEvent: await this.mapEvent(savedEvent),
      session: this.mapSession(savedSession),
      events: await this.getMatchEvents(matchId),
      redBalls: await this.getRedBallState(matchId),
    };
  }

  async activateRedBall(matchId: number, dto: ActivateRedBallDto) {
    const match = await this.findMatchForService(matchId);
    const session = await this.getOrCreateSession(match);

    this.assertCanCreateGameEvent(session);
    this.assertTeamBelongsToMatch(match, dto.teamId);

    const alreadyUsed = await this.matchRedBallRepository.findOne({
      where: {
        matchId,
        teamId: dto.teamId,
      },
    });

    if (alreadyUsed) {
      throw new BadRequestException(
        'Команда уже использовала красный мяч в этом матче',
      );
    }

    const currentSecond = this.getCurrentElapsedSeconds(session);

    const activation = this.matchRedBallRepository.create({
      matchId,
      teamId: dto.teamId,
      activatedHalf: session.currentHalf,
      activatedSecond: currentSecond,
      durationSeconds: 120,
      status: RedBallStatus.ACTIVE,
    });

    const savedActivation = await this.matchRedBallRepository.save(activation);

    const event = this.matchEventRepository.create({
      matchId,
      teamId: dto.teamId,
      eventType: MatchEventType.RED_BALL,
      half: session.currentHalf,
      second: currentSecond,
      minute: this.getEventMinute(currentSecond),
      description: 'Команда активировала красный мяч',
      isCancelled: false,
    });

    await this.matchEventRepository.save(event);

    const redBalls = await this.getRedBallState(match.id);

    return {
      redBall: savedActivation,
      session: this.mapSession(session),
      events: await this.getMatchEvents(matchId),
      redBalls,
    };
  }

  private async getActiveRedBallForGoal(params: {
    matchId: number;
    scoringTeamId: number;
    goalSecond: number;
  }): Promise<MatchRedBallActivationEntity | null> {
    const { matchId, goalSecond } = params;

    const activeRedBalls = await this.matchRedBallRepository.find({
      where: {
        matchId,
        status: RedBallStatus.ACTIVE,
      },
    });

    return (
      activeRedBalls.find((redBall) => {
        const start = redBall.activatedSecond;
        const end = redBall.activatedSecond + redBall.durationSeconds;

        return goalSecond >= start && goalSecond <= end;
      }) ?? null
    );
  }

  private async getRedBallState(matchId: number) {
    const redBalls = await this.matchRedBallRepository.find({
      where: {
        matchId,
      },
      order: {
        id: 'ASC',
      },
    });

    return {
      active: redBalls
        .filter((redBall) => redBall.status === RedBallStatus.ACTIVE)
        .map((redBall) => ({
          id: redBall.id,
          teamId: redBall.teamId,
          activatedHalf: redBall.activatedHalf,
          activatedSecond: redBall.activatedSecond,
          durationSeconds: redBall.durationSeconds,
          status: redBall.status,
        })),

      usedTeamIds: redBalls
        .filter((redBall) => redBall.status !== RedBallStatus.CANCELLED)
        .map((redBall) => redBall.teamId),
    };
  }

  private async restoreRedBallIfGoalCancelled(params: {
    match: MatchEntity;
    session: MatchServiceSessionEntity;
    event: MatchEventEntity;
  }): Promise<void> {
    const { match, session, event } = params;

    if (event.eventType !== MatchEventType.GOAL) {
      return;
    }

    const redBall = await this.matchRedBallRepository.findOne({
      where: {
        matchId: match.id,
        teamId: event.teamId,
        completedByEventId: event.id,
        status: RedBallStatus.COMPLETED_BY_GOAL,
      },
    });

    if (!redBall) {
      return;
    }

    const currentSecond = this.getCurrentElapsedSeconds(session);

    const isExpired =
      session.currentHalf > redBall.activatedHalf ||
      currentSecond >= redBall.activatedSecond + redBall.durationSeconds;

    if (isExpired) {
      redBall.status = RedBallStatus.COMPLETED_BY_TIME;
      redBall.completedHalf = session.currentHalf;
      redBall.completedSecond = currentSecond;
      redBall.completedByEventId = null;
    } else {
      redBall.status = RedBallStatus.ACTIVE;
      redBall.completedHalf = null;
      redBall.completedSecond = null;
      redBall.completedByEventId = null;
    }

    await this.matchRedBallRepository.save(redBall);
  }

  private async getGoalValue(params: {
    matchId: number;
    eventType: MatchEventType;
    goalSecond: number;
  }): Promise<number> {
    const { matchId, eventType, goalSecond } = params;

    if (
      eventType !== MatchEventType.GOAL &&
      eventType !== MatchEventType.OWN_GOAL
    ) {
      return 1;
    }

    const activeRedBalls = await this.matchRedBallRepository.find({
      where: {
        matchId,
        status: RedBallStatus.ACTIVE,
      },
    });

    const hasActiveRedBall = activeRedBalls.some((redBall) => {
      const start = redBall.activatedSecond;
      const end = redBall.activatedSecond + redBall.durationSeconds;

      return goalSecond >= start && goalSecond <= end;
    });

    return hasActiveRedBall ? 2 : 1;
  }

  private async applyOfficialResult(
    match: MatchEntity,
    authoritativeRegularTime: { home: number; away: number },
    dto: FinalizeMatchResultDto,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    const isAdministrative =
      dto.resolutionType === MatchResolutionType.TECHNICAL ||
      dto.resolutionType === MatchResolutionType.WALKOVER;
    if (
      dto.regularTime &&
      !isAdministrative &&
      (dto.regularTime.home !== authoritativeRegularTime.home ||
        dto.regularTime.away !== authoritativeRegularTime.away)
    ) {
      throw new BadRequestException(
        'regularTime must match the score recorded by match events',
      );
    }

    const regularTime =
      isAdministrative && dto.regularTime
        ? dto.regularTime
        : authoritativeRegularTime;
    const rules = await this.getEffectiveMatchRules(match, manager);
    const resolved = this.matchResultResolver.resolve({
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      regularTime,
      extraTime: dto.extraTime,
      penalties: dto.penalties,
      resolutionType: dto.resolutionType,
      winnerTeamId: dto.winnerTeamId,
      rules,
    });

    match.regularTimeHomeScore = resolved.regularTime.home;
    match.regularTimeAwayScore = resolved.regularTime.away;
    match.extraTimeHomeScore = resolved.extraTime?.home;
    match.extraTimeAwayScore = resolved.extraTime?.away;
    match.penaltyHomeScore = resolved.penalties?.home;
    match.penaltyAwayScore = resolved.penalties?.away;
    match.penaltyHomeKicksTaken = resolved.penalties?.homeKicksTaken;
    match.penaltyAwayKicksTaken = resolved.penalties?.awayKicksTaken;
    match.homeScore = resolved.legacyScore.home;
    match.awayScore = resolved.legacyScore.away;
    match.winnerTeamId = resolved.winnerTeamId;
    match.loserTeamId = resolved.loserTeamId;
    match.resolutionType = resolved.resolutionType;
    match.technicalResultReason =
      resolved.resolutionType === MatchResolutionType.TECHNICAL
        ? dto.technicalResultReason
        : undefined;
    match.resultOfficialAt = new Date();
    match.status = MatchStatus.FINISHED;
  }

  private async getEffectiveMatchRules(
    match: MatchEntity,
    manager: EntityManager,
  ): Promise<MatchRulesV1> {
    if (!match.stageId) return LEGACY_MATCH_RULES;

    const stage = await manager.getRepository(TournamentStageEntity).findOne({
      where: { id: match.stageId, tournamentId: match.tournamentId },
    });
    if (!stage) return LEGACY_MATCH_RULES;

    let ruleVersionId = match.effectiveRuleVersionId;
    if (!ruleVersionId) {
      const tournament = await manager
        .getRepository(TournamentEntity)
        .findOne({ where: { id: match.tournamentId } });
      ruleVersionId = tournament?.activeRuleVersionId;
    }
    if (!ruleVersionId) return LEGACY_MATCH_RULES;

    const version = await manager
      .getRepository(TournamentRuleVersionEntity)
      .findOne({
        where: { id: ruleVersionId, tournamentId: match.tournamentId },
      });
    if (!version) return LEGACY_MATCH_RULES;

    const stageRules = version.config.stages.find(
      (candidate) => candidate.stageKey === stage.key,
    );
    if (!stageRules) {
      throw new BadRequestException(
        `Rule version ${version.version} has no match settings for stage ${stage.key}`,
      );
    }
    return stageRules.match;
  }
}
