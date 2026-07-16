import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { MatchResolutionType } from '../../matches/enums/match-resolution-type.enum';

export class MatchScoreDto {
  @IsInt()
  @Min(0)
  home: number;

  @IsInt()
  @Min(0)
  away: number;
}

export class PenaltyShootoutScoreDto extends MatchScoreDto {
  @IsInt()
  @Min(0)
  homeKicksTaken: number;

  @IsInt()
  @Min(0)
  awayKicksTaken: number;
}

export class FinalizeMatchResultDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MatchScoreDto)
  regularTime?: MatchScoreDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MatchScoreDto)
  extraTime?: MatchScoreDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PenaltyShootoutScoreDto)
  penalties?: PenaltyShootoutScoreDto;

  @IsOptional()
  @IsEnum(MatchResolutionType)
  resolutionType?: MatchResolutionType;

  @IsOptional()
  @IsInt()
  @Min(1)
  winnerTeamId?: number;
}
