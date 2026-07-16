import { IsInt, Max, Min } from 'class-validator';

export class PreviewGroupStageScheduleDto {
  @IsInt()
  @Min(1)
  @Max(4)
  legs: number;
}
