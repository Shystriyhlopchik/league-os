import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { TournamentDecisionEntityType } from '../enums/tournament-decision-entity-type.enum';
import { TournamentDecisionType } from '../enums/tournament-decision-type.enum';

export class TournamentDecisionAffectedEntityDto {
  @IsEnum(TournamentDecisionEntityType)
  entityType: TournamentDecisionEntityType;

  @IsInt()
  @Min(1)
  entityId: number;
}

export class CreateTournamentDecisionDto {
  @IsEnum(TournamentDecisionType)
  type: TournamentDecisionType;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TournamentDecisionAffectedEntityDto)
  affectedEntities: TournamentDecisionAffectedEntityDto[];

  @IsObject()
  valuesAfter: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
