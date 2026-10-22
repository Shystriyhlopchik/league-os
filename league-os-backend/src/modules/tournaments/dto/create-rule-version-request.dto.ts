import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

import type { TournamentRulesConfig } from '../../tournament-rules/types/tournament-rules-config.type';

export class CreateRuleVersionRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  schemaVersion?: number;

  @IsObject()
  config: TournamentRulesConfig;

  @IsOptional()
  @IsString()
  changeSummary?: string;
}
