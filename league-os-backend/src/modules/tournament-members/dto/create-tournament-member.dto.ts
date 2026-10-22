import { IsEnum, IsInt, IsOptional } from 'class-validator';

import { TournamentMemberRole } from '../enums/tournament-member-role.enum';

export class CreateTournamentMemberDto {
  @IsInt()
  tournamentId: number;

  @IsInt()
  userId: number;

  @IsOptional()
  @IsEnum(TournamentMemberRole)
  role?: TournamentMemberRole;
}
