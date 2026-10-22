import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { TournamentRuleVersionStatus } from '../enums/tournament-rule-version-status.enum';
import type { TournamentRulesConfig } from '../types/tournament-rules-config.type';

export class CreateTournamentRuleVersionDto {
  @IsInt()
  tournamentId: number;

  @IsInt()
  @Min(1)
  version: number;

  @IsInt()
  @Min(1)
  schemaVersion: number;

  @IsObject()
  config: TournamentRulesConfig;

  @IsOptional()
  @IsEnum(TournamentRuleVersionStatus)
  status?: TournamentRuleVersionStatus;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsInt()
  basedOnVersionId?: number;

  @IsOptional()
  @IsInt()
  createdByUserId?: number;

  @IsOptional()
  @IsInt()
  publishedByUserId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeSummary?: string;
}
