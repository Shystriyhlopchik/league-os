import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualKnockoutPairDto {
  @IsInt()
  @Min(1)
  homeTournamentTeamId: number;

  @IsInt()
  @Min(1)
  awayTournamentTeamId: number;
}

export class KnockoutSeedingDrawResultDto {
  @IsInt()
  @Min(1)
  tournamentTeamId: number;

  @IsInt()
  @Min(1)
  rank: number;
}

export class PreviewKnockoutBracketDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  randomSeed?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualKnockoutPairDto)
  manualPairs?: ManualKnockoutPairDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KnockoutSeedingDrawResultDto)
  drawResults?: KnockoutSeedingDrawResultDto[];
}
