import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerTransferEntity } from './entities/player-transfer.entity';
import { PlayerTransfersController } from './player-transfers.controller';
import { PlayerTransfersService } from './player-transfers.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([PlayerTransferEntity]), UsersModule],
  controllers: [PlayerTransfersController],
  providers: [PlayerTransfersService],
})
export class PlayerTransfersModule {}
