import { PartialType } from '@nestjs/mapped-types';

import { CreateGroupRequestDto } from './create-group-request.dto';

export class UpdateGroupRequestDto extends PartialType(CreateGroupRequestDto) {}
