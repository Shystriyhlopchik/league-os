import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TeamEntity } from '../teams/entities/team.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { CreateTeamPlayerDto } from './dto/create-team-player.dto';
import { TeamPlayerEntity } from './entities/team-players.entity';

@Injectable()
export class TeamPlayersService {
  constructor(
    @InjectRepository(TeamPlayerEntity)
    private readonly teamPlayersRepository: Repository<TeamPlayerEntity>,

    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,

    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
  ) {}

  async findByTeam(teamId: number): Promise<TeamPlayerEntity[]> {
    const team = await this.teamsRepository.findOne({
      where: {
        id: teamId,
      },
    });

    if (!team) {
      throw new NotFoundException('Команда не найдена');
    }

    return this.teamPlayersRepository.find({
      where: {
        teamId,
        isActive: true,
      },
      relations: {
        player: true,
      },
      order: {
        shirtNumber: 'ASC',
        id: 'ASC',
      },
    });
  }

  async createForTeam(
    teamId: number,
    dto: CreateTeamPlayerDto,
  ): Promise<TeamPlayerEntity> {
    const team = await this.teamsRepository.findOne({
      where: {
        id: teamId,
      },
    });

    if (!team) {
      throw new NotFoundException('Команда не найдена');
    }

    if (dto.shirtNumber) {
      const existingNumber = await this.teamPlayersRepository.findOne({
        where: {
          teamId,
          shirtNumber: dto.shirtNumber,
          isActive: true,
        },
      });

      if (existingNumber) {
        throw new BadRequestException(
          'Игрок с таким номером уже есть в этой команде',
        );
      }
    }

    const slug = await this.generatePlayerSlug(dto.lastName, dto.firstName);

      const player = new PlayerEntity();

      player.firstName = dto.firstName.trim();
      player.lastName = dto.lastName.trim();
      player.middleName = dto.middleName?.trim() || undefined;
      player.slug = slug;
      player.position = dto.position ?? undefined;
      player.isActive = true;

      const savedPlayer: PlayerEntity = await this.playersRepository.save(player);

      const teamPlayer = new TeamPlayerEntity();

      teamPlayer.teamId = teamId;
      teamPlayer.playerId = savedPlayer.id;
      teamPlayer.shirtNumber = dto.shirtNumber ?? undefined;
      teamPlayer.position = dto.position ?? undefined;
      teamPlayer.isCaptain = dto.isCaptain ?? false;
      teamPlayer.isActive = true;
      teamPlayer.joinedAt = new Date().toISOString().slice(0, 10);

      const savedTeamPlayer: TeamPlayerEntity =
          await this.teamPlayersRepository.save(teamPlayer);

    return this.teamPlayersRepository.findOneOrFail({
      where: {
        id: savedTeamPlayer.id,
      },
      relations: {
        player: true,
      },
    });
  }

  private async generatePlayerSlug(
    lastName: string,
    firstName: string,
  ): Promise<string> {
    const baseSlug = this.toSlug(`${lastName}-${firstName}`);
    let slug = baseSlug;
    let counter = 1;

    while (
      await this.playersRepository.findOne({
        where: {
          slug,
        },
      })
    ) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    return slug;
  }

  private toSlug(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/ё/g, 'e')
      .replace(/й/g, 'i')
      .replace(/ц/g, 'c')
      .replace(/у/g, 'u')
      .replace(/к/g, 'k')
      .replace(/е/g, 'e')
      .replace(/н/g, 'n')
      .replace(/г/g, 'g')
      .replace(/ш/g, 'sh')
      .replace(/щ/g, 'sch')
      .replace(/з/g, 'z')
      .replace(/х/g, 'h')
      .replace(/ъ/g, '')
      .replace(/ф/g, 'f')
      .replace(/ы/g, 'y')
      .replace(/в/g, 'v')
      .replace(/а/g, 'a')
      .replace(/п/g, 'p')
      .replace(/р/g, 'r')
      .replace(/о/g, 'o')
      .replace(/л/g, 'l')
      .replace(/д/g, 'd')
      .replace(/ж/g, 'zh')
      .replace(/э/g, 'e')
      .replace(/я/g, 'ya')
      .replace(/ч/g, 'ch')
      .replace(/с/g, 's')
      .replace(/м/g, 'm')
      .replace(/и/g, 'i')
      .replace(/т/g, 't')
      .replace(/ь/g, '')
      .replace(/б/g, 'b')
      .replace(/ю/g, 'yu')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
