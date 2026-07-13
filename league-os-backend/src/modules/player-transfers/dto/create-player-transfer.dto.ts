import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlayerTransferDto {
  @IsInt() @Type(() => Number) playerId: number;
  @IsInt() @Type(() => Number) fromTeamId: number;
  @IsInt() @Type(() => Number) toTeamId: number;

  @IsOptional() @IsInt() @Min(1) @Max(99)
  @Type(() => Number)
  shirtNumber?: number;

  @IsOptional() @IsBoolean()
  isCaptain?: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  comment?: string;
}
