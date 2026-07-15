import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

import { TournamentStageParticipantStatus } from '../enums/tournament-stage-participant-status.enum';

export class CreateTournamentStageParticipantDto {
  @IsInt()
  stageId: number;

  @IsInt()
  tournamentTeamId: number;

  @IsOptional()
  @IsInt()
  groupId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  seedNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_-]*$/)
  qualificationSource?: string;

  @IsOptional()
  @IsEnum(TournamentStageParticipantStatus)
  status?: TournamentStageParticipantStatus;
}
