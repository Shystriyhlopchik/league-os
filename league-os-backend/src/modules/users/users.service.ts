import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { FindOptionsWhere, Raw, Repository } from 'typeorm';
import { RoleEntity } from '../roles/entities/role.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async findByEmailOrUsername(login: string) {
    return this.findUnambiguous([
      { email: this.canonical(login) }, { username: this.canonical(login) },
    ]);
  }

  async findByEmail(email: string) {
    return this.findUnambiguous([{ email: this.canonical(email) }]);
  }

  async findByUsername(username: string) {
    return this.findUnambiguous([{ username: this.canonical(username) }]);
  }

  private canonical(value: string) {
    // Equality, not ILIKE: '%' and '_' in a login must remain literal.
    return Raw((column) => `LOWER(BTRIM(${column})) = :login`, {
      login: value.trim().toLowerCase(),
    });
  }

  private async findUnambiguous(where: FindOptionsWhere<UserEntity>[]) {
    const users = await this.usersRepository.find({ where, relations: { roles: true }, take: 2 });
    if (users.length > 1) throw new ConflictException(
      'Найдено несколько учётных записей с таким логином или email. Обратитесь к администратору',
    );
    return users[0] ?? null;
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
