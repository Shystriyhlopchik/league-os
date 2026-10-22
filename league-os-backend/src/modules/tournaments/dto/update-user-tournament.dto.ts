import { PartialType } from '@nestjs/mapped-types';

import { CreateUserTournamentDto } from './create-user-tournament.dto';

export class UpdateUserTournamentDto extends PartialType(
  CreateUserTournamentDto,
) {}
