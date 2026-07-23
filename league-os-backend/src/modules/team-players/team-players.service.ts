import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TeamEntity } from '../teams/entities/team.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { CreateTeamPlayerDto } from './dto/create-team-player.dto';
import { UpdateTeamPlayerDto } from './dto/update-team-player.dto';
import { TeamPlayerEntity } from './entities/team-players.entity';
import { UsersService } from '../users/users.service';
import { RoleCode } from '../users/enums/role-code.enum';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

    private readonly usersService: UsersService,
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
    currentUserId: number,
    photo?: { buffer: Buffer },
  ): Promise<TeamPlayerEntity> {
    await this.ensureTeamExists(teamId);
    await this.ensureCanManageTeam(teamId, currentUserId);
    await this.ensureShirtNumberAvailable(teamId, dto.shirtNumber);

    const savedPlayer = await this.createPlayer(dto, photo);
    const savedTeamPlayer = await this.createTeamPlayer(
      teamId,
      savedPlayer.id,
      dto,
    );

    return this.findTeamPlayerWithPlayer(savedTeamPlayer.id);
  }

  async updateForTeam(
    teamId: number,
    teamPlayerId: number,
    dto: UpdateTeamPlayerDto,
    currentUserId: number,
    photo?: { buffer: Buffer },
  ): Promise<TeamPlayerEntity> {
    await this.ensureTeamExists(teamId);
    await this.ensureCanManageTeam(teamId, currentUserId);

    const teamPlayer = await this.teamPlayersRepository.findOne({
      where: { id: teamPlayerId, teamId },
      relations: { player: true },
    });

    if (!teamPlayer) {
      throw new NotFoundException('Игрок команды не найден');
    }

    await this.ensureShirtNumberAvailable(
      teamId,
      dto.shirtNumber,
      teamPlayerId,
    );

    const player = teamPlayer.player;

    if (dto.firstName !== undefined) player.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) player.lastName = dto.lastName.trim();
    if (dto.middleName !== undefined) {
      player.middleName = dto.middleName?.trim() || undefined;
    }
    if (dto.birthDate !== undefined) player.birthDate = dto.birthDate;
    if (dto.preferredFoot !== undefined) player.preferredFoot = dto.preferredFoot;
    if (dto.position !== undefined) player.position = dto.position;
    if (photo) player.photoUrl = await this.savePlayerPhoto(player.slug, photo.buffer);

    if (dto.shirtNumber !== undefined) teamPlayer.shirtNumber = dto.shirtNumber;
    if (dto.position !== undefined) teamPlayer.position = dto.position;
    if (dto.isCaptain !== undefined) teamPlayer.isCaptain = dto.isCaptain;

    await this.playersRepository.save(player);
    await this.teamPlayersRepository.save(teamPlayer);

    return this.findTeamPlayerWithPlayer(teamPlayer.id);
  }

  async removeFromTeam(
    teamId: number,
    teamPlayerId: number,
    currentUserId: number,
  ): Promise<{ id: number; isActive: false; leftAt: string }> {
    await this.ensureTeamExists(teamId);
    await this.ensureCanManageTeam(teamId, currentUserId);

    const teamPlayer = await this.teamPlayersRepository.findOne({
      where: {
        id: teamPlayerId,
        teamId,
        isActive: true,
      },
    });

    if (!teamPlayer) {
      throw new NotFoundException('Игрок команды не найден');
    }

    teamPlayer.isActive = false;
    teamPlayer.isCaptain = false;
    teamPlayer.leftAt = this.getCurrentDate();

    await this.teamPlayersRepository.save(teamPlayer);

    return {
      id: teamPlayer.id,
      isActive: false,
      leftAt: teamPlayer.leftAt,
    };
  }

  private async ensureCanManageTeam(
    teamId: number,
    currentUserId: number,
  ): Promise<void> {
    const user = await this.usersService.findById(currentUserId);
    const userRoles = user?.roles?.map((role) => role.code) ?? [];

    if (
      userRoles.includes(RoleCode.Admin) ||
      userRoles.includes(RoleCode.SuperAdmin)
    ) {
      return;
    }

    const captainLink = await this.teamPlayersRepository
      .createQueryBuilder('team_player')
      .innerJoin('team_player.player', 'player')
      .where('team_player.team_id = :teamId', { teamId })
      .andWhere('"team_player"."isActive" = :isActive', { isActive: true })
      .andWhere('"team_player"."isCaptain" = :isCaptain', { isCaptain: true })
      .andWhere('player.user_id = :currentUserId', { currentUserId })
      .getOne();

    if (!captainLink) {
      throw new ForbiddenException('Недостаточно прав для изменения состава команды');
    }
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
    excludedTeamPlayerId?: number,
  ): Promise<void> {
    if (!shirtNumber) {
      return;
    }

    const query = this.teamPlayersRepository
      .createQueryBuilder('team_player')
      .where('team_player.team_id = :teamId', { teamId })
      .andWhere('"team_player"."shirtNumber" = :shirtNumber', { shirtNumber })
      .andWhere('"team_player"."isActive" = :isActive', { isActive: true });

    if (excludedTeamPlayerId !== undefined) {
      query.andWhere('team_player.id != :excludedTeamPlayerId', {
        excludedTeamPlayerId,
      });
    }

    const existingNumber = await query.getOne();

    if (existingNumber) {
      throw new BadRequestException(DUPLICATE_SHIRT_NUMBER_MESSAGE);
    }
  }

  private async createPlayer(
    dto: CreateTeamPlayerDto,
    photo?: { buffer: Buffer },
  ): Promise<PlayerEntity> {
    const slug = await this.generatePlayerSlug(dto.lastName, dto.firstName);
    const photoUrl = photo
      ? await this.savePlayerPhoto(slug, photo.buffer)
      : undefined;
    const player = this.playersRepository.create({
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      middleName: dto.middleName?.trim() || undefined,
      slug,
      birthDate: dto.birthDate,
      preferredFoot: dto.preferredFoot,
      photoUrl,
      position: dto.position ?? undefined,
      isActive: true,
    });

    return this.playersRepository.save(player);
  }

  private async savePlayerPhoto(slug: string, buffer: Buffer): Promise<string> {
    const extension = this.detectPlayerPhotoExtension(buffer);

    if (!extension) {
      throw new BadRequestException(
        'Фото игрока должно быть в формате PNG, JPEG или WebP',
      );
    }

    const directory = join(process.cwd(), 'uploads', 'players');
    const fileName = `${slug}-${Date.now()}.${extension}`;

    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, fileName), buffer);

    return `/uploads/players/${fileName}`;
  }

  private detectPlayerPhotoExtension(
    buffer: Buffer,
  ): 'png' | 'jpg' | 'webp' | null {
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    if (
      buffer.length >= pngSignature.length &&
      buffer.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
      return 'png';
    }

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'jpg';
    }

    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'webp';
    }

    return null;
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
