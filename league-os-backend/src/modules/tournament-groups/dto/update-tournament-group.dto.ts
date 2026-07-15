import { PartialType } from '@nestjs/mapped-types';

import { CreateTournamentGroupDto } from './create-tournament-group.dto';

export class UpdateTournamentGroupDto extends PartialType(
  CreateTournamentGroupDto,
) {}
