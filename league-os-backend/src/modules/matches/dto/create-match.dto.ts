import {
  IsDateString,
  IsEnum,
  IsInt,
  MaxLength,
  Min,
  IsOptional,
  IsString,
} from 'class-validator';

import { MatchRoundType } from '../enums/match-round-type.enum';
import { MatchStatus } from '../enums/match-status.enum';

export class CreateMatchDto {
  @IsInt()
  tournamentId: number;

  @IsInt()
  homeTeamId: number;

  @IsInt()
  awayTeamId: number;

  @IsOptional()
  @IsInt()
  venueId?: number;

  @IsOptional()
  @IsDateString()
  matchDatetime?: string;

  @IsOptional()
  @IsString()
  round?: string;

  @IsOptional()
  @IsInt()
  stageId?: number;

  @IsOptional()
  @IsInt()
  groupId?: number;

  @IsOptional()
  @IsEnum(MatchRoundType)
  roundType?: MatchRoundType;

  @IsOptional()
  @IsInt()
  @Min(1)
  roundNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bracketPosition?: string;

  @IsOptional()
  @IsInt()
  effectiveRuleVersionId?: number;

  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;
}
