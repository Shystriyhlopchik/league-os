import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CalendarBatchMatchDto {
  @IsInt() @Min(1) id: number;
  @IsInt() @Min(0) expectedRevision: number;
  @ValidateIf((v) => v.roundNumber !== undefined)
  @IsInt()
  @Min(1)
  @Max(10000)
  roundNumber?: number;
  @IsBoolean() postponed: boolean;
  @ValidateIf((v) => !v.postponed)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
  matchDatetime?: string;
  @ValidateIf((v) => !v.postponed)
  @IsInt()
  @Min(1)
  venueId?: number;
  @IsInt() @Min(1) @Max(480) durationMinutes: number;
}

export class PreviewCalendarBatchDto {
  @IsUUID() requestId: string;
  @IsString()
  @Matches(/\S/, { message: 'Укажите причину изменения календаря' })
  @MaxLength(1000)
  reason: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CalendarBatchMatchDto)
  changes: CalendarBatchMatchDto[];
}

export class SaveCalendarBatchDto extends PreviewCalendarBatchDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedVersion: string;
}
