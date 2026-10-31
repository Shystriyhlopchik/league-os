import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScheduleImportRowDto {
  @IsInt() @Min(2) @Max(1001) row: number;
  @IsString() @MaxLength(255) group: string;
  @IsInt() @Min(1) @Max(10000) roundNumber: number;
  @IsString() @MaxLength(255) home: string;
  @IsString() @MaxLength(255) away: string;
  @IsString() @MaxLength(20) date: string;
  @IsString() @MaxLength(10) time: string;
  @IsString() @MaxLength(255) venue: string;
}

export class ScheduleImportMappingDto {
  @IsIn(['group', 'team', 'venue']) kind: 'group' | 'team' | 'venue';
  @IsString() @MaxLength(255) source: string;
  @IsInt() @Min(1) id: number;
}

export class PreviewScheduleImportDto {
  @IsIn(['append', 'replace']) mode: 'append' | 'replace';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ScheduleImportRowDto)
  rows: ScheduleImportRowDto[];
  @IsArray()
  @ArrayMaxSize(3000)
  @ValidateNested({ each: true })
  @Type(() => ScheduleImportMappingDto)
  mappings: ScheduleImportMappingDto[];
}

export class ConfirmScheduleImportDto extends PreviewScheduleImportDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedVersion: string;
  @IsOptional() @Equals('REPLACE_PREPARED_SCHEDULE') confirmation?: string;
}
