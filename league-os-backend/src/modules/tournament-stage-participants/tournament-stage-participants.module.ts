import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TournamentStageParticipantEntity } from './entities/tournament-stage-participant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TournamentStageParticipantEntity])],
  exports: [TypeOrmModule],
})
export class TournamentStageParticipantsModule {}
