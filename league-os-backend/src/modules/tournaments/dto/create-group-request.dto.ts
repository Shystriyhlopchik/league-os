import { OmitType } from '@nestjs/mapped-types';

import { CreateTournamentGroupDto } from '../../tournament-groups/dto/create-tournament-group.dto';

export class CreateGroupRequestDto extends OmitType(CreateTournamentGroupDto, [
  'stageId',
] as const) {}
