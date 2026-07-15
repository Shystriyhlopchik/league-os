import { PartialType } from '@nestjs/mapped-types';

import { CreateStageRequestDto } from './create-stage-request.dto';

export class UpdateStageRequestDto extends PartialType(CreateStageRequestDto) {}
