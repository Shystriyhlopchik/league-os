import { IsInt, Max, Min } from 'class-validator';

/** Only group-stage pairings; dates and venues use the calendar endpoint. */
export class ManualScheduleMatchDto {
  @IsInt()
  @Min(1)
  groupId: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  roundNumber: number;

  @IsInt()
  @Min(1)
  homeTeamId: number;

  @IsInt()
  @Min(1)
  awayTeamId: number;
}
