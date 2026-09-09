import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class KnockoutMatchScheduleDto {
  @IsString()
  @MaxLength(100)
  bracketPosition: string;

  @IsDateString()
  matchDatetime: string;

  @IsInt()
  @Min(1)
  venueId: number;
}

export class ConfirmKnockoutBracketDto {
  @IsOptional()
  @IsBoolean()
  replaceCurrent?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => KnockoutMatchScheduleDto)
  schedule?: KnockoutMatchScheduleDto[];
}
