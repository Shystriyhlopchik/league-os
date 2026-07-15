import { PartialType } from '@nestjs/mapped-types';

import { CreateTournamentMemberDto } from './create-tournament-member.dto';

export class UpdateTournamentMemberDto extends PartialType(
  CreateTournamentMemberDto,
) {}
