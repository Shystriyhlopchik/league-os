import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { Repository } from 'typeorm';

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
}
