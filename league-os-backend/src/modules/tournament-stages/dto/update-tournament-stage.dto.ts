import { PartialType } from '@nestjs/mapped-types';

import { CreateTournamentStageDto } from './create-tournament-stage.dto';

export class UpdateTournamentStageDto extends PartialType(
  CreateTournamentStageDto,
) {}
