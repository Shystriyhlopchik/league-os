import { PartialType } from '@nestjs/mapped-types';

import { CreateStageParticipantRequestDto } from './create-stage-participant-request.dto';

export class UpdateStageParticipantRequestDto extends PartialType(
  CreateStageParticipantRequestDto,
) {}
