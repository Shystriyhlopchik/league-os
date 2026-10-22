import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePlayerTransferDto } from './dto/create-player-transfer.dto';
import { PlayerTransferEntity } from './entities/player-transfer.entity';
import { UsersService } from '../users/users.service';
import { RoleCode } from '../users/enums/role-code.enum';

@Injectable()
export class PlayerTransfersService {
  constructor(
    @InjectRepository(PlayerTransferEntity)
    private readonly transfers: Repository<PlayerTransferEntity>,
    private readonly users: UsersService,
  ) {}

  async findAll(userId: number) {
    await this.ensureAdmin(userId);
    return this.transfers.find({
      relations: {
        player: true,
        fromTeam: true,
        toTeam: true,
        createdByUser: true,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async create(_dto: CreatePlayerTransferDto, userId: number) {
    await this.ensureAdmin(userId);
    // Legacy transfers moved statistics and suspensions across all tournaments.
    throw new ConflictException(
      'Оформляйте переход в разделе «Заявки на турниры и составы». История и утверждённые составы турниров не переносятся',
    );
  }

  private async ensureAdmin(userId: number) {
    const user = await this.users.findById(userId);
    if (
      !user?.roles.some((r) =>
        [RoleCode.Admin, RoleCode.SuperAdmin].includes(r.code),
      )
    )
      throw new ForbiddenException();
  }
}
