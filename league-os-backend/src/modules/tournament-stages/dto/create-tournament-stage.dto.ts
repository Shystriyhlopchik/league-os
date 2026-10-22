import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

import { TournamentStageStatus } from '../enums/tournament-stage-status.enum';
import { TournamentStageType } from '../enums/tournament-stage-type.enum';
import type { TournamentStageConfiguration } from '../types/tournament-stage-configuration.type';

export class CreateTournamentStageDto {
  @IsInt()
  tournamentId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_-]*$/)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEnum(TournamentStageType)
  type: TournamentStageType;

  @IsInt()
  @Min(1)
  order: number;

  @IsOptional()
  @IsEnum(TournamentStageStatus)
  status?: TournamentStageStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsObject()
  configuration?: Partial<TournamentStageConfiguration>;
}
