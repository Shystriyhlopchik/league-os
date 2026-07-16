import { IsIn, IsOptional } from 'class-validator';

import { PreviewGroupStageScheduleDto } from './preview-group-stage-schedule.dto';

export const GROUP_STAGE_SCHEDULE_RESET_CONFIRMATION =
  'RESET_GROUP_STAGE_SCHEDULE' as const;

export class GenerateGroupStageScheduleDto extends PreviewGroupStageScheduleDto {
  @IsOptional()
  @IsIn([GROUP_STAGE_SCHEDULE_RESET_CONFIRMATION])
  resetConfirmation?: typeof GROUP_STAGE_SCHEDULE_RESET_CONFIRMATION;
}
