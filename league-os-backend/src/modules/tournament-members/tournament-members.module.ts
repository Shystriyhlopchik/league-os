import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TournamentMemberEntity } from './entities/tournament-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TournamentMemberEntity])],
  exports: [TypeOrmModule],
})
export class TournamentMembersModule {}
