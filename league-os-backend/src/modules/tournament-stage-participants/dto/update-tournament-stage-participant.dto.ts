import { PartialType } from '@nestjs/mapped-types';

import { CreateTournamentStageParticipantDto } from './create-tournament-stage-participant.dto';

export class UpdateTournamentStageParticipantDto extends PartialType(
  CreateTournamentStageParticipantDto,
) {}
