import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { TournamentType } from '../enums/tournament-type.enum';
import { TournamentFormat } from '../enums/tournament-format.enum';
import { TournamentStatus } from '../enums/tournament-status.enum';
import { TournamentLifecycleStatus } from '../enums/tournament-lifecycle-status.enum';

export class CreateTournamentDto {
  @IsInt()
  seasonId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TournamentType)
  type?: TournamentType;

  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  ownerUserId?: number;

  @IsOptional()
  @IsEnum(TournamentLifecycleStatus)
  lifecycleStatus?: TournamentLifecycleStatus;
}
