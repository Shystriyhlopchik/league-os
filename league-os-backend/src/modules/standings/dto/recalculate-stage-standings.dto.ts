import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class StandingResolutionDto {
  @IsInt()
  @Min(1)
  teamId: number;

  @IsInt()
  @Min(1)
  rank: number;
}

export class RecalculateStageStandingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  ruleVersionId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StandingResolutionDto)
  manualDecisions?: StandingResolutionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StandingResolutionDto)
  drawResults?: StandingResolutionDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  drawSeed?: number;
}
