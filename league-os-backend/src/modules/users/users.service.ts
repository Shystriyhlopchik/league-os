import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { ILike, Repository } from 'typeorm';
import { RoleEntity } from '../roles/entities/role.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async findByEmailOrUsername(login: string) {
    return this.usersRepository.findOne({
      where: [{ email: login }, { username: login }],
      relations: {
        roles: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.usersRepository.findOne({
      where: {
        email: ILike(email.trim()),
      },
      relations: {
        roles: true,
      },
    });
  }

  async findByUsername(username: string) {
    return this.usersRepository.findOne({
      where: {
        username,
      },
      relations: {
        roles: true,
      },
    });
  }

  findById(id: number) {
    return this.usersRepository.findOne({
      where: {
        id,
      },
      relations: {
        roles: true,
      },
    });
  }

  create(data: Partial<UserEntity>) {
    const user = this.usersRepository.create(data);

    return this.usersRepository.save(user);
  }

  save(user: UserEntity) {
    return this.usersRepository.save(user);
  }

  async addRoles(userId: number, roles: RoleEntity[]) {
    const user = await this.findById(userId);

    if (!user) {
      return null;
    }

    const existingCodes = new Set(user.roles?.map((role) => role.code) ?? []);
    const missingRoles = roles.filter((role) => !existingCodes.has(role.code));

    if (!missingRoles.length) {
      return user;
    }

    user.roles = [...(user.roles ?? []), ...missingRoles];

    await this.usersRepository.save(user);

    return this.findById(userId);
  }
}
