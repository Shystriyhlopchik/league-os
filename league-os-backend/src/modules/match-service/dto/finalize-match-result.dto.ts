import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf(
    (dto: FinalizeMatchResultDto) =>
      dto.resolutionType === MatchResolutionType.TECHNICAL ||
      dto.technicalResultReason !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  technicalResultReason?: string;
}
