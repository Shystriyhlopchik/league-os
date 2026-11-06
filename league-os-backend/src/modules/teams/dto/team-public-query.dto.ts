import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class TeamPublicQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) communityId?: number;
}

export class TeamStatisticsQuery extends TeamPublicQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) seasonId?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) tournamentId?: number;
}
