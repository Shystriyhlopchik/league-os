import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualQualificationSelectionDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]*$/)
  qualificationRuleId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  tournamentTeamIds: number[];
}

export class QualificationDrawResultDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]*$/)
  qualificationRuleId: string;

  @IsInt()
  @Min(1)
  tournamentTeamId: number;

  @IsInt()
  @Min(1)
  rank: number;
}

export class PreviewQualificationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  ruleVersionId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualQualificationSelectionDto)
  manualSelections?: ManualQualificationSelectionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QualificationDrawResultDto)
  drawResults?: QualificationDrawResultDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(32)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  selectedTournamentTeamIds?: number[];
}
