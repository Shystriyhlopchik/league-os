import { IsInt, IsString, Matches, Min } from 'class-validator';

export class UpdateCalendarMatchDto {
  // The database stores local wall-clock timestamps, as does the existing calendar.
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
  matchDatetime: string;
  @IsInt() @Min(1) venueId: number;
}
