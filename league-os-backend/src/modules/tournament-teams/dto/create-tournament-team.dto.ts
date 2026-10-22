import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { TournamentTeamStatus } from '../enums/tournament-team-status.enum';
import { TeamRatingResult } from '../enums/team-rating-result.enum';

export class CreateTournamentTeamDto {
  @IsInt()
  tournamentId: number;

  @IsInt()
  teamId: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  groupName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seedNumber?: number;

  @IsOptional()
  @IsEnum(TournamentTeamStatus)
  status?: TournamentTeamStatus;

  @IsOptional()
  @IsEnum(TeamRatingResult)
  ratingResult?: TeamRatingResult;
}
