import { OmitType } from '@nestjs/mapped-types';

import { CreateTournamentStageDto } from '../../tournament-stages/dto/create-tournament-stage.dto';

export class CreateStageRequestDto extends OmitType(CreateTournamentStageDto, [
  'tournamentId',
] as const) {}
