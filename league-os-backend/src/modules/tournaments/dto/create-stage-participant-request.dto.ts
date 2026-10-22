import { OmitType } from '@nestjs/mapped-types';

import { CreateTournamentStageParticipantDto } from '../../tournament-stage-participants/dto/create-tournament-stage-participant.dto';

export class CreateStageParticipantRequestDto extends OmitType(
  CreateTournamentStageParticipantDto,
  ['stageId'] as const,
) {}
