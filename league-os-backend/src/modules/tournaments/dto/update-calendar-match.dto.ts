import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdateCalendarMatchDto {
  @IsOptional() @IsBoolean() postponed?: boolean;

  @ValidateIf((v) => v.postponed !== true)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
  matchDatetime?: string;
  @ValidateIf((v) => v.postponed !== true)
  @IsInt() @Min(1) venueId?: number;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsInt() @Min(0) expectedRevision?: number;
  // Occupied slot includes changeover, not just playing time.
  @IsOptional() @IsInt() @Min(1) @Max(480) durationMinutes?: number;
}
