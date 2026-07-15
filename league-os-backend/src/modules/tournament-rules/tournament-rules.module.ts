import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TournamentRuleVersionEntity } from './entities/tournament-rule-version.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TournamentRuleVersionEntity])],
  exports: [TypeOrmModule],
})
export class TournamentRulesModule {}
