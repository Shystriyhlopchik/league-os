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
}
