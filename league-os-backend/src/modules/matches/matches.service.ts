import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MatchEntity } from './entities/match.entity';
import { DeepPartial, Repository } from 'typeorm';
import { BaseCrudService } from '../../common/base/base-crud.service';
import { formatLocalDateTime } from './helper/formatLocalDateTime';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchStatus } from './enums/match-status.enum';

const ERR_MESSAGE = 'Команды в матче не могут быть одинаковыми';

@Injectable()
export class MatchesService extends BaseCrudService<MatchEntity> {
  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchesRepository: Repository<MatchEntity>,

    @InjectRepository(MatchRosterEntity)
    private readonly matchRosterRepository: Repository<MatchRosterEntity>,

    @InjectRepository(MatchRosterPlayerEntity)
    private readonly matchRosterPlayerRepository: Repository<MatchRosterPlayerEntity>,
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
    if (dto.homeTeamId && dto.awayTeamId && dto.homeTeamId === dto.awayTeamId) {
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

        tournament: {
          season: {
            competition: true,
          },
        },
      },
      order: {
        matchDatetime: 'ASC',
        id: 'ASC',
      },
    });

    return matches
      .filter(
        (match) =>
          Boolean(match.homeTeam) &&
          Boolean(match.awayTeam) &&
          Boolean(match.matchDatetime),
      )
      .map((match) => ({
        id: match.id,
        tournamentId: match.tournamentId,

        round: match.round,
        status: match.status,
        matchDateTime: formatLocalDateTime(match.matchDatetime),

        tournament: {
          id: match.tournament.id,
          name: match.tournament.name,
          logoUrl:
            match.tournament.logoUrl ??
            match.tournament.season.competition.logoUrl,

          season: {
            id: match.tournament.season.id,
            name: match.tournament.season.name,
            year: match.tournament.season.year,
          },

          competition: {
            id: match.tournament.season.competition.id,
            name: match.tournament.season.competition.name,
            slug: match.tournament.season.competition.slug,
            logoUrl: match.tournament.season.competition.logoUrl,
            colorPrimary: match.tournament.season.competition.colorPrimary,
          },
        },

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

  async findBySeason(seasonId: number) {
    const matches = await this.matchesRepository.find({
      where: {
        tournament: {
          seasonId,
        },
      },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,

        tournament: {
          season: {
            competition: true,
          },
        },
      },
      order: {
        matchDatetime: 'ASC',
        id: 'ASC',
      },
    });

    return matches
      .filter(
        (match) =>
          Boolean(match.homeTeam) &&
          Boolean(match.awayTeam) &&
          Boolean(match.matchDatetime),
      )
      .map((match) => ({
        id: match.id,
        tournamentId: match.tournamentId,
        round: match.round,
        status: match.status,
        matchDateTime: formatLocalDateTime(match.matchDatetime),

        tournament: {
          id: match.tournament.id,
          name: match.tournament.name,
          logoUrl:
            match.tournament.logoUrl ??
            match.tournament.season.competition.logoUrl,

          season: {
            id: match.tournament.season.id,
            name: match.tournament.season.name,
            year: match.tournament.season.year,
          },

          competition: {
            id: match.tournament.season.competition.id,
            name: match.tournament.season.competition.name,
            slug: match.tournament.season.competition.slug,
            logoUrl: match.tournament.season.competition.logoUrl,
            colorPrimary: match.tournament.season.competition.colorPrimary,
          },
        },

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

  async findProtocol(matchId: number) {
    const match = await this.matchesRepository.findOne({
      where: { id: matchId },
      relations: {
        homeTeam: true,
        awayTeam: true,
        venue: true,
        tournament: {
          season: {
            competition: true,
          },
        },
        events: {
          team: true,
          player: true,
          assistPlayer: true,
          secondaryPlayer: true,
        },
        officials: true,
      },
      order: {
        events: {
          half: 'ASC',
          second: 'ASC',
          minute: 'ASC',
          addedMinute: 'ASC',
          id: 'ASC',
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Матч не найден');
    }

    const rosters = await this.getProtocolRosters(match);
    const activeEvents = match.events.filter((event) => !event.isCancelled);

    return {
      match: {
        id: match.id,
        status: match.status,
        round: match.round,
        matchDateTime: formatLocalDateTime(match.matchDatetime),

        tournament: {
          id: match.tournament.id,
          name: match.tournament.name,
          logoUrl: match.tournament.logoUrl ?? null,

          season: {
            id: match.tournament.season.id,
            name: match.tournament.season.name,
            year: match.tournament.season.year,
          },

          competition: {
            id: match.tournament.season.competition.id,
            name: match.tournament.season.competition.name,
            logoUrl: match.tournament.season.competition.logoUrl,
          },
        },

        venue: match.venue
          ? {
              id: match.venue.id,
              name: match.venue.name,
            }
          : null,

        homeTeam: {
          id: match.homeTeam.id,
          name: match.homeTeam.name,
          shortName: match.homeTeam.shortName,
          logoUrl: match.homeTeam.logoUrl,
          score: match.homeScore,
        },

        awayTeam: {
          id: match.awayTeam.id,
          name: match.awayTeam.name,
          shortName: match.awayTeam.shortName,
          logoUrl: match.awayTeam.logoUrl,
          score: match.awayScore,
        },

        result: {
          regularTime: {
            home: match.regularTimeHomeScore ?? match.homeScore,
            away: match.regularTimeAwayScore ?? match.awayScore,
          },
          extraTime:
            match.extraTimeHomeScore != null && match.extraTimeAwayScore != null
              ? {
                  home: match.extraTimeHomeScore,
                  away: match.extraTimeAwayScore,
                }
              : null,
          penalties:
            match.penaltyHomeScore != null &&
            match.penaltyAwayScore != null &&
            match.penaltyHomeKicksTaken != null &&
            match.penaltyAwayKicksTaken != null
              ? {
                  home: match.penaltyHomeScore,
                  away: match.penaltyAwayScore,
                  homeKicksTaken: match.penaltyHomeKicksTaken,
                  awayKicksTaken: match.penaltyAwayKicksTaken,
                }
              : null,
          resolutionType: match.resolutionType ?? null,
          winnerTeamId: match.winnerTeamId ?? null,
          loserTeamId: match.loserTeamId ?? null,
          officialAt: match.resultOfficialAt ?? null,
        },
      },

      officials: match.officials.map((official) => ({
        id: official.id,
        fullName: official.fullName,
        role: official.role,
      })),

      events: activeEvents.map((event) => ({
        id: event.id,
        type: event.eventType,

        minute: event.minute,
        addedMinute: event.addedMinute,
        half: event.half,
        second: event.second,

        team: event.team
          ? {
              id: event.team.id,
              name: event.team.name,
              shortName: event.team.shortName,
            }
          : null,

        player: event.player
          ? {
              id: event.player.id,
              firstName: event.player.firstName,
              lastName: event.player.lastName,
              middleName: event.player.middleName,
            }
          : null,

        assistPlayer: event.assistPlayer
          ? {
              id: event.assistPlayer.id,
              firstName: event.assistPlayer.firstName,
              lastName: event.assistPlayer.lastName,
              middleName: event.assistPlayer.middleName,
            }
          : null,

        secondaryPlayer: event.secondaryPlayer
          ? {
              id: event.secondaryPlayer.id,
              firstName: event.secondaryPlayer.firstName,
              lastName: event.secondaryPlayer.lastName,
              middleName: event.secondaryPlayer.middleName,
            }
          : null,

        description: event.description,
      })),

      rosters,
    };
  }

  private async getProtocolRosters(match: MatchEntity) {
    const matchRosters = await this.matchRosterRepository.find({
      where:
        match.status === MatchStatus.FINISHED
          ? [
              { matchId: match.id, isApproved: true },
              { matchId: match.id, isSubmitted: true },
            ]
          : { matchId: match.id, isApproved: true },
      relations: {
        team: true,
      },
    });

    const rosterByTeamId = new Map(
      matchRosters.map((roster) => [roster.teamId, roster]),
    );

    const [home, away] = await Promise.all([
      this.getProtocolRosterPlayers(rosterByTeamId.get(match.homeTeamId)),
      this.getProtocolRosterPlayers(rosterByTeamId.get(match.awayTeamId)),
    ]);

    return {
      home,
      away,
    };
  }

  private async getProtocolRosterPlayers(roster?: MatchRosterEntity) {
    if (!roster) {
      return [];
    }

    const rosterPlayers = await this.matchRosterPlayerRepository.find({
      where: {
        matchRosterId: roster.id,
      },
      relations: {
        player: true,
      },
      order: {
        shirtNumber: 'ASC',
        id: 'ASC',
      },
    });

    return rosterPlayers.map((rosterPlayer) => ({
      id: rosterPlayer.playerId,
      matchRosterPlayerId: rosterPlayer.id,
      teamPlayerId: rosterPlayer.teamPlayerId,

      firstName: rosterPlayer.player.firstName,
      lastName: rosterPlayer.player.lastName,
      middleName: rosterPlayer.player.middleName,
      photoUrl: rosterPlayer.player.photoUrl,

      shirtNumber: rosterPlayer.shirtNumber,
      position: rosterPlayer.position ?? rosterPlayer.player.position,

      isCaptain: rosterPlayer.isCaptain,
      wasAllowed: rosterPlayer.wasAllowed,
    }));
  }
}
