import { IsIn, IsInt, IsObject, IsOptional, Min } from 'class-validator';

import type { TournamentRulesConfig } from '../../tournament-rules/types/tournament-rules-config.type';

export class PreviewTournamentDto {
  @IsOptional()
  @IsIn(['configuration', 'launch'])
  mode?: 'configuration' | 'launch';

  @IsOptional()
  @IsInt()
  @Min(1)
  ruleVersionId?: number;

  @IsOptional()
  @IsObject()
  config?: TournamentRulesConfig;
}
