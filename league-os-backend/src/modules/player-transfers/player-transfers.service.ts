import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { CreatePlayerTransferDto } from './dto/create-player-transfer.dto';
import { PlayerTransferEntity } from './entities/player-transfer.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { TeamEntity } from '../teams/entities/team.entity';
import { UsersService } from '../users/users.service';
import { RoleCode } from '../users/enums/role-code.enum';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { PlayerTournamentStatEntity } from '../player-tournament-stats/entities/player-tournament-stat.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { PlayerSuspensionEntity } from '../player-suspensions/entities/player-suspension.entity';
import { PlayerSuspensionStatus } from '../player-suspensions/enums/player-suspension-status.enum';

@Injectable()
export class PlayerTransfersService {
  constructor(
    @InjectRepository(PlayerTransferEntity)
    private readonly transfersRepository: Repository<PlayerTransferEntity>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(currentUserId: number) {
    await this.ensureAdmin(currentUserId);
    return this.transfersRepository.find({
      relations: {
        player: true,
        fromTeam: true,
        toTeam: true,
        createdByUser: true,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async create(dto: CreatePlayerTransferDto, currentUserId: number) {
    await this.ensureAdmin(currentUserId);
    if (dto.fromTeamId === dto.toTeamId) {
      throw new BadRequestException(
        'Исходная и новая команды должны различаться',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const teamRepository = manager.getRepository(TeamEntity);
      const teamPlayerRepository = manager.getRepository(TeamPlayerEntity);
      const rosterRepository = manager.getRepository(MatchRosterEntity);
      const rosterPlayerRepository = manager.getRepository(
        MatchRosterPlayerEntity,
      );
      const matchRepository = manager.getRepository(MatchEntity);
      const statsRepository = manager.getRepository(PlayerTournamentStatEntity);
      const suspensionRepository = manager.getRepository(
        PlayerSuspensionEntity,
      );
      const playerRepository = manager.getRepository(PlayerEntity);
      const transferRepository = manager.getRepository(PlayerTransferEntity);

      const [fromTeam, toTeam] = await Promise.all([
        teamRepository.findOne({
          where: { id: dto.fromTeamId, isActive: true },
        }),
        teamRepository.findOne({ where: { id: dto.toTeamId, isActive: true } }),
      ]);
      if (!fromTeam || !toTeam)
        throw new NotFoundException('Команда не найдена');

      const source = await teamPlayerRepository.findOne({
        where: {
          playerId: dto.playerId,
          teamId: dto.fromTeamId,
          isActive: true,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!source)
        throw new NotFoundException('Игрок не состоит в исходной команде');

      const player = await playerRepository.findOne({
        where: { id: source.playerId, isActive: true },
      });
      if (!player) throw new NotFoundException('Игрок не найден');

      const activeLink = await teamPlayerRepository.findOne({
        where: { playerId: dto.playerId, isActive: true },
      });
      if (activeLink?.id !== source.id) {
        throw new BadRequestException(
          'Игрок уже состоит в другой активной команде',
        );
      }

      if (dto.shirtNumber) {
        const duplicateNumber = await teamPlayerRepository.findOne({
          where: {
            teamId: dto.toTeamId,
            shirtNumber: dto.shirtNumber,
            isActive: true,
          },
        });
        if (duplicateNumber)
          throw new BadRequestException('Номер уже занят в новой команде');
      }

      const today = new Date().toISOString().slice(0, 10);
      source.isActive = false;
      source.isCaptain = false;
      source.leftAt = today;
      await teamPlayerRepository.save(source);

      const destination = await teamPlayerRepository.save(
        teamPlayerRepository.create({
          teamId: dto.toTeamId,
          playerId: source.playerId,
          shirtNumber: dto.shirtNumber,
          position: source.position ?? player.position,
          isCaptain: dto.isCaptain ?? false,
          isActive: true,
          joinedAt: today,
        }),
      );

      const futureMatches = await matchRepository.find({
        where: [
          {
            homeTeamId: dto.fromTeamId,
            status: MatchStatus.SCHEDULED,
            matchDatetime: MoreThan(new Date()),
          },
          {
            awayTeamId: dto.fromTeamId,
            status: MatchStatus.SCHEDULED,
            matchDatetime: MoreThan(new Date()),
          },
        ],
      });
      if (futureMatches.length) {
        const rosters = await rosterRepository
          .createQueryBuilder('roster')
          .where('roster.match_id IN (:...matchIds)', {
            matchIds: futureMatches.map((match) => match.id),
          })
          .andWhere('roster.team_id = :teamId', { teamId: dto.fromTeamId })
          .andWhere('roster.is_submitted = false')
          .getMany();
        if (rosters.length) {
          await rosterPlayerRepository
            .createQueryBuilder()
            .delete()
            .where('match_roster_id IN (:...rosterIds)', {
              rosterIds: rosters.map((roster) => roster.id),
            })
            .andWhere('player_id = :playerId', { playerId: dto.playerId })
            .execute();
        }
      }

      const oldStats = await statsRepository.find({
        where: { playerId: dto.playerId, teamId: dto.fromTeamId },
      });
      for (const oldStat of oldStats) {
        let newStat = await statsRepository.findOne({
          where: {
            tournamentId: oldStat.tournamentId,
            teamId: dto.toTeamId,
            playerId: dto.playerId,
          },
        });
        if (!newStat) {
          newStat = statsRepository.create({
            tournamentId: oldStat.tournamentId,
            teamId: dto.toTeamId,
            playerId: dto.playerId,
            yellowCards: oldStat.yellowCards,
            redCards: oldStat.redCards,
            secondYellowCards: oldStat.secondYellowCards,
            suspensionsServed: oldStat.suspensionsServed,
            isSuspended: false,
          });
        } else {
          newStat.yellowCards = Math.max(
            newStat.yellowCards,
            oldStat.yellowCards,
          );
          newStat.redCards = Math.max(newStat.redCards, oldStat.redCards);
          newStat.secondYellowCards = Math.max(
            newStat.secondYellowCards,
            oldStat.secondYellowCards,
          );
        }
        await statsRepository.save(newStat);
      }
      await suspensionRepository.update(
        {
          playerId: dto.playerId,
          teamId: dto.fromTeamId,
          status: PlayerSuspensionStatus.ACTIVE,
        },
        { teamId: dto.toTeamId },
      );

      const transfer = await transferRepository.save(
        transferRepository.create({
          playerId: dto.playerId,
          fromTeamId: dto.fromTeamId,
          toTeamId: dto.toTeamId,
          fromTeamPlayerId: source.id,
          toTeamPlayerId: destination.id,
          transferDate: today,
          comment: dto.comment?.trim() || undefined,
          createdByUserId: currentUserId,
        }),
      );
      return transferRepository.findOneOrFail({
        where: { id: transfer.id },
        relations: {
          player: true,
          fromTeam: true,
          toTeam: true,
          createdByUser: true,
        },
      });
    });
  }

  private async ensureAdmin(userId: number): Promise<void> {
    const user = await this.usersService.findById(userId);
    const roles = user?.roles?.map((role) => role.code) ?? [];
    if (
      !roles.includes(RoleCode.Admin) &&
      !roles.includes(RoleCode.SuperAdmin)
    ) {
      throw new ForbiddenException(
        'Оформлять трансферы может только администратор',
      );
    }
  }
}
