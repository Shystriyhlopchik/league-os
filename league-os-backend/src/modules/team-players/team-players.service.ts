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

const TEAM_NOT_FOUND_MESSAGE = 'Команда не найдена';
const DUPLICATE_SHIRT_NUMBER_MESSAGE =
  'Игрок с таким номером уже есть в этой команде';

const CYRILLIC_TRANSLITERATION: Record<string, string> = {
  ё: 'e',
  й: 'i',
  ц: 'c',
  у: 'u',
  к: 'k',
  е: 'e',
  н: 'n',
  г: 'g',
  ш: 'sh',
  щ: 'sch',
  з: 'z',
  х: 'h',
  ъ: '',
  ф: 'f',
  ы: 'y',
  в: 'v',
  а: 'a',
  п: 'p',
  р: 'r',
  о: 'o',
  л: 'l',
  д: 'd',
  ж: 'zh',
  э: 'e',
  я: 'ya',
  ч: 'ch',
  с: 's',
  м: 'm',
  и: 'i',
  т: 't',
  ь: '',
  б: 'b',
  ю: 'yu',
};

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
    await this.ensureTeamExists(teamId);

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
    await this.ensureTeamExists(teamId);
    await this.ensureShirtNumberAvailable(teamId, dto.shirtNumber);

    const savedPlayer = await this.createPlayer(dto);
    const savedTeamPlayer = await this.createTeamPlayer(
      teamId,
      savedPlayer.id,
      dto,
    );

    return this.findTeamPlayerWithPlayer(savedTeamPlayer.id);
  }

  private async ensureTeamExists(teamId: number): Promise<void> {
    const team = await this.teamsRepository.findOne({
      where: {
        id: teamId,
      },
    });

    if (!team) {
      throw new NotFoundException(TEAM_NOT_FOUND_MESSAGE);
    }
  }

  private async ensureShirtNumberAvailable(
    teamId: number,
    shirtNumber?: number,
  ): Promise<void> {
    if (!shirtNumber) {
      return;
    }

    const existingNumber = await this.teamPlayersRepository.findOne({
      where: {
        teamId,
        shirtNumber,
        isActive: true,
      },
    });

    if (existingNumber) {
      throw new BadRequestException(DUPLICATE_SHIRT_NUMBER_MESSAGE);
    }
  }

  private async createPlayer(dto: CreateTeamPlayerDto): Promise<PlayerEntity> {
    const slug = await this.generatePlayerSlug(dto.lastName, dto.firstName);
    const player = this.playersRepository.create({
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      middleName: dto.middleName?.trim() || undefined,
      slug,
      position: dto.position ?? undefined,
      isActive: true,
    });

    return this.playersRepository.save(player);
  }

  private createTeamPlayer(
    teamId: number,
    playerId: number,
    dto: CreateTeamPlayerDto,
  ): Promise<TeamPlayerEntity> {
    const teamPlayer = this.teamPlayersRepository.create({
      teamId,
      playerId,
      shirtNumber: dto.shirtNumber ?? undefined,
      position: dto.position ?? undefined,
      isCaptain: dto.isCaptain ?? false,
      isActive: true,
      joinedAt: this.getCurrentDate(),
    });

    return this.teamPlayersRepository.save(teamPlayer);
  }

  private findTeamPlayerWithPlayer(id: number): Promise<TeamPlayerEntity> {
    return this.teamPlayersRepository.findOneOrFail({
      where: {
        id,
      },
      relations: {
        player: true,
      },
    });
  }

  private getCurrentDate(): string {
    return new Date().toISOString().slice(0, 10);
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
      .replace(/[а-яё]/g, (letter) => CYRILLIC_TRANSLITERATION[letter] ?? '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
