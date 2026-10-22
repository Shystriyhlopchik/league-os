import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

import { ManualKnockoutPairDto } from './preview-knockout-bracket.dto';
import { KnockoutMatchScheduleDto } from './confirm-knockout-bracket.dto';

export class LaunchPlayoffDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  selectedTournamentTeamIds: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualKnockoutPairDto)
  manualPairs: ManualKnockoutPairDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => KnockoutMatchScheduleDto)
  schedule: KnockoutMatchScheduleDto[];
}
