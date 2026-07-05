import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RolesService } from '../roles/roles.service';
import { RoleCode } from '../users/enums/role-code.enum';
import { UserAuthAccountEntity } from './entities/user-auth-account.entity';
import { AuthProvider } from './enums/auth-provider.enum';
import { PlayerEntity } from '../players/entities/player.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { ConfirmPlayerLinkDto } from './dto/confirm-player-link.dto';
import { UserEntity } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly rolesService: RolesService,

    @InjectRepository(UserAuthAccountEntity)
    private readonly authAccountsRepository: Repository<UserAuthAccountEntity>,

    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,

    @InjectRepository(TeamPlayerEntity)
    private readonly teamPlayersRepository: Repository<TeamPlayerEntity>,
  ) {}

  async register(dto: RegisterDto) {
    const username = dto.username.trim();
    const login = this.normalizeLogin(username);
    const email = dto.email?.trim().toLowerCase();

    const existingAuthAccount = await this.findLocalAuthAccount(login);
    const existingUsername = await this.usersService.findByUsername(username);
    const existingEmail = email
      ? await this.usersService.findByEmail(email)
      : null;

    if (existingAuthAccount || existingUsername) {
      throw new ConflictException('Пользователь с таким логином уже существует');
    }

    if (existingEmail) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const userRole = await this.rolesService.findByCode(RoleCode.User);

    if (!userRole) {
      throw new InternalServerErrorException('Роль USER не найдена');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.usersService.create({
      email,
      username,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      middleName: dto.middleName?.trim() || undefined,
      // Kept for backward compatibility with existing local users.
      passwordHash,
      roles: [userRole],
    });

    await this.authAccountsRepository.save(
      this.authAccountsRepository.create({
        userId: user.id,
        provider: AuthProvider.Local,
        login,
        passwordHash,
      }),
    );

    const createdUser = await this.usersService.findById(user.id);

    if (!createdUser) {
      throw new InternalServerErrorException('Не удалось загрузить пользователя');
    }

    return {
      ...(await this.buildAuthResponse(createdUser)),
      playerLinkCandidates: await this.findPlayerLinkCandidates(createdUser),
    };
  }

  async login(dto: LoginDto) {
    const login = this.normalizeLogin(dto.login);
    const authAccount = await this.findLocalAuthAccount(login);

    if (authAccount) {
      const isPasswordValid = authAccount.passwordHash
        ? await bcrypt.compare(dto.password, authAccount.passwordHash)
        : false;

      if (!isPasswordValid || !authAccount.user?.isActive) {
        throw new UnauthorizedException('Неверный логин или пароль');
      }

      return this.buildAuthResponse(authAccount.user);
    }

    const user = await this.usersService.findByEmailOrUsername(dto.login);

    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const isPasswordValid = user.passwordHash
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : false;

    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    return this.buildAuthResponse(user);
  }

  async me(userId: number) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    return this.buildUserResponse(user);
  }

  async confirmPlayerLink(userId: number, dto: ConfirmPlayerLinkDto) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    const teamPlayer = await this.teamPlayersRepository.findOne({
      where: {
        id: dto.teamPlayerId,
        isActive: true,
      },
      relations: {
        player: true,
        team: true,
      },
    });

    if (!teamPlayer) {
      throw new NotFoundException('Игрок команды не найден');
    }

    if (!this.isSamePerson(user, teamPlayer.player)) {
      throw new BadRequestException('ФИО пользователя не совпадает с игроком');
    }

    if (teamPlayer.player.userId && teamPlayer.player.userId !== user.id) {
      throw new ConflictException('Этот игрок уже привязан к другому пользователю');
    }

    teamPlayer.player.userId = user.id;
    await this.playersRepository.save(teamPlayer.player);

    const playerRole = await this.rolesService.findByCode(RoleCode.Player);

    if (!playerRole) {
      throw new InternalServerErrorException('Роль PLAYER не найдена');
    }

    const rolesToAdd = [playerRole];

    if (teamPlayer.isCaptain) {
      const captainRole = await this.rolesService.findByCode(RoleCode.Captain);

      if (!captainRole) {
        throw new InternalServerErrorException('Роль CAPTAIN не найдена');
      }

      rolesToAdd.push(captainRole);
    }

    const updatedUser = await this.usersService.addRoles(user.id, rolesToAdd);

    if (!updatedUser) {
      throw new InternalServerErrorException('Не удалось обновить роли пользователя');
    }

    return this.buildAuthResponse(updatedUser);
  }

  private async buildAuthResponse(user: UserEntity) {
    const userResponse = await this.buildUserResponse(user);
    const payload = {
      sub: user.id,
      email: user.email ?? null,
      roles: userResponse.roles,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: userResponse,
    };
  }

  private async buildUserResponse(user: UserEntity) {
    const linkedPlayer = await this.playersRepository.findOne({
      where: {
        userId: user.id,
      },
    });

    const teamLinks = linkedPlayer
      ? await this.teamPlayersRepository.find({
          where: {
            playerId: linkedPlayer.id,
            isActive: true,
          },
          relations: {
            team: true,
          },
        })
      : [];

    const captainTeamIds = teamLinks
      .filter((teamLink) => teamLink.isCaptain)
      .map((teamLink) => teamLink.teamId);

    return {
      id: user.id,
      email: user.email ?? null,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName ?? null,
      roles: user.roles?.map((role) => role.code) ?? [],
      linkedPlayer: linkedPlayer
        ? {
            id: linkedPlayer.id,
            firstName: linkedPlayer.firstName,
            lastName: linkedPlayer.lastName,
            middleName: linkedPlayer.middleName ?? null,
          }
        : null,
      captainTeamIds,
      manageableTeamIds: captainTeamIds,
    };
  }

  private findLocalAuthAccount(login: string) {
    return this.authAccountsRepository.findOne({
      where: {
        provider: AuthProvider.Local,
        login,
      },
      relations: {
        user: {
          roles: true,
        },
      },
    });
  }

  private async findPlayerLinkCandidates(user: UserEntity) {
    const firstName = this.normalizeName(user.firstName);
    const lastName = this.normalizeName(user.lastName);
    const middleName = this.normalizeName(user.middleName);

    if (!firstName || !lastName) {
      return [];
    }

    const query = this.teamPlayersRepository
      .createQueryBuilder('team_player')
      .innerJoinAndSelect('team_player.player', 'player')
      .innerJoinAndSelect('team_player.team', 'team')
      .where('"team_player"."isActive" = :isActive', { isActive: true })
      .andWhere('player."isActive" = :isActive', { isActive: true })
      .andWhere('LOWER(TRIM(player."firstName")) = :firstName', { firstName })
      .andWhere('LOWER(TRIM(player."lastName")) = :lastName', { lastName })
      .andWhere('(player.user_id IS NULL OR player.user_id = :userId)', {
        userId: user.id,
      });

    if (middleName) {
      query.andWhere(
        'LOWER(TRIM(COALESCE(player."middleName", \'\'))) = :middleName',
        { middleName },
      );
    }

    const candidates = await query.getMany();

    return candidates.map((candidate) => ({
      teamPlayerId: candidate.id,
      playerId: candidate.playerId,
      teamId: candidate.teamId,
      teamName: candidate.team.name,
      isCaptain: candidate.isCaptain,
      player: {
        id: candidate.player.id,
        firstName: candidate.player.firstName,
        lastName: candidate.player.lastName,
        middleName: candidate.player.middleName ?? null,
      },
    }));
  }

  private isSamePerson(user: UserEntity, player: PlayerEntity): boolean {
    const userMiddleName = this.normalizeName(user.middleName);
    const playerMiddleName = this.normalizeName(player.middleName);

    return (
      this.normalizeName(user.firstName) === this.normalizeName(player.firstName) &&
      this.normalizeName(user.lastName) === this.normalizeName(player.lastName) &&
      (!userMiddleName || !playerMiddleName || userMiddleName === playerMiddleName)
    );
  }

  private normalizeLogin(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeName(value?: string | null): string {
    return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  }
}
