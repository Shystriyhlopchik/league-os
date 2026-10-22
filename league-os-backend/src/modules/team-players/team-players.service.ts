import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CommunitySquadsService } from '../registrations/community-squads.service';

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
    private readonly dataSource: DataSource,
    private readonly squads: CommunitySquadsService,
  ) {}

  async findByTeam(teamId: number): Promise<TeamPlayerEntity[]> {
    await this.ensureTeamExists(teamId, true);

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
    return this.dataSource.transaction(async (manager) => {
      const communityId = await this.squads.defaultCommunityId(manager);
      await this.squads.lockCommunity(manager, communityId);
      const user = await this.usersService.findById(currentUserId);
      await this.squads.assertManage(
        communityId,
        teamId,
        { id: currentUserId, roles: user?.roles.map((r) => r.code) },
        manager,
      );
      await this.squads.assertSlot(
        manager,
        communityId,
        teamId,
        dto.shirtNumber,
      );
      // Serialize creation of person identities across communities as well.
      await manager.query('SELECT pg_advisory_xact_lock(72918401)');
      const candidates = await manager
        .getRepository(PlayerEntity)
        .createQueryBuilder('p')
        .where('lower(trim(p."firstName")) = lower(:firstName)', {
          firstName: dto.firstName.trim(),
        })
        .andWhere('lower(trim(p."lastName")) = lower(:lastName)', {
          lastName: dto.lastName.trim(),
        })
        .andWhere('(p."birthDate" = :birthDate OR p."birthDate" IS NULL)', {
          birthDate: dto.birthDate,
        })
        .getMany();
      if (candidates.length)
        throw new ConflictException({
          code: 'PLAYER_ALREADY_EXISTS',
          message:
            'Найдены карточки с таким именем и датой рождения. Выберите существующего игрока через поиск. Для однофамильцев обратитесь к администратору',
          playerIds: candidates.map((p) => p.id),
        });
      const player = await this.createPlayer(dto, photo, manager);
      const link = await manager.save(TeamPlayerEntity, {
        communityId,
        teamId,
        playerId: player.id,
        shirtNumber: dto.shirtNumber,
        position: dto.position,
        isCaptain: dto.isCaptain ?? false,
        isActive: true,
        joinedAt: this.getCurrentDate(),
      });
      return manager.findOneOrFail(TeamPlayerEntity, {
        where: { id: link.id },
        relations: { player: true },
      });
    });
  }

  async updateForTeam(
    teamId: number,
    teamPlayerId: number,
    dto: UpdateTeamPlayerDto,
    currentUserId: number,
    photo?: { buffer: Buffer },
  ): Promise<TeamPlayerEntity> {
    return this.dataSource.transaction(async (manager) => {
      const communityId = await this.squads.defaultCommunityId(manager);
      await this.squads.lockCommunity(manager, communityId);
      await this.ensureTeamExists(teamId);
      await this.ensureCanManageTeam(teamId, currentUserId);

      const teamPlayer = await manager.findOne(TeamPlayerEntity, {
        where: { id: teamPlayerId, teamId, communityId, isActive: true },
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

      const currentUser = await this.usersService.findById(currentUserId);
      const canEditIdentity =
        currentUser?.roles.some((r) =>
          [RoleCode.Admin, RoleCode.SuperAdmin].includes(r.code),
        ) ?? false;
      if (
        !canEditIdentity &&
        ((dto.firstName !== undefined &&
          dto.firstName.trim() !== player.firstName) ||
          (dto.lastName !== undefined &&
            dto.lastName.trim() !== player.lastName) ||
          (dto.middleName !== undefined &&
            (dto.middleName?.trim() || '') !== (player.middleName || '')) ||
          (dto.birthDate !== undefined && dto.birthDate !== player.birthDate))
      )
        throw new ForbiddenException(
          'ФИО и дату рождения общей карточки исправляет администратор',
        );

      if (dto.firstName !== undefined) player.firstName = dto.firstName.trim();
      if (dto.lastName !== undefined) player.lastName = dto.lastName.trim();
      if (dto.middleName !== undefined) {
        player.middleName = dto.middleName?.trim() || undefined;
      }
      if (dto.birthDate !== undefined) player.birthDate = dto.birthDate;
      if (
        canEditIdentity &&
        (dto.firstName !== undefined ||
          dto.lastName !== undefined ||
          dto.birthDate !== undefined)
      ) {
        await manager.query('SELECT pg_advisory_xact_lock(72918401)');
        const duplicate = await manager
          .getRepository(PlayerEntity)
          .createQueryBuilder('p')
          .where('p.id != :id', { id: player.id })
          .andWhere('lower(trim(p."firstName")) = lower(:firstName)', {
            firstName: player.firstName,
          })
          .andWhere('lower(trim(p."lastName")) = lower(:lastName)', {
            lastName: player.lastName,
          })
          .andWhere('(p."birthDate" = :birthDate OR p."birthDate" IS NULL)', {
            birthDate: player.birthDate ?? null,
          })
          .getExists();
        if (duplicate)
          throw new ConflictException(
            'Существует другая карточка с таким именем и датой рождения. Не объединяйте игроков изменением ФИО',
          );
      }
      if (dto.preferredFoot !== undefined)
        player.preferredFoot = dto.preferredFoot;
      if (dto.position !== undefined) player.position = dto.position;
      if (photo)
        player.photoUrl = await this.savePlayerPhoto(player.slug, photo.buffer);

      if (dto.shirtNumber !== undefined)
        teamPlayer.shirtNumber = dto.shirtNumber;
      if (dto.position !== undefined) teamPlayer.position = dto.position;
      if (dto.isCaptain === false)
        await this.squads.assertCaptainHandover(
          teamPlayer,
          { id: currentUserId, roles: currentUser?.roles.map((r) => r.code) },
          manager,
        );
      if (dto.isCaptain !== undefined) teamPlayer.isCaptain = dto.isCaptain;

      await manager.save(player);
      await manager.save(teamPlayer);

      return manager.findOneOrFail(TeamPlayerEntity, {
        where: { id: teamPlayer.id },
        relations: { player: true },
      });
    });
  }

  async removeFromTeam(
    teamId: number,
    teamPlayerId: number,
    currentUserId: number,
  ): Promise<{ id: number; isActive: false; leftAt: string }> {
    const communityId = await this.squads.defaultCommunityId();
    const user = await this.usersService.findById(currentUserId);
    await this.squads.remove(communityId, teamId, teamPlayerId, {
      id: currentUserId,
      roles: user?.roles.map((r) => r.code),
    });
    return { id: teamPlayerId, isActive: false, leftAt: this.getCurrentDate() };
  }

  private async ensureCanManageTeam(
    teamId: number,
    currentUserId: number,
  ): Promise<void> {
    const communityId = await this.squads.defaultCommunityId();
    const actor = await this.usersService.findById(currentUserId);
    await this.squads.assertManage(communityId, teamId, {
      id: currentUserId,
      roles: actor?.roles.map((r) => r.code),
    });
  }

  private async ensureTeamExists(
    teamId: number,
    publicOnly = false,
  ): Promise<void> {
    const team = await this.teamsRepository.findOne({
      where: {
        id: teamId,
        ...(publicOnly ? { profileStatus: 'published' } : {}),
        isActive: true,
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
    manager?: EntityManager,
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

    return manager
      ? manager.save(PlayerEntity, player)
      : this.playersRepository.save(player);
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
