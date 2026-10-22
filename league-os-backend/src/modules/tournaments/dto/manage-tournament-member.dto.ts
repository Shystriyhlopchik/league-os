import { IsEnum, IsInt } from 'class-validator';

import { TournamentMemberRole } from '../../tournament-members/enums/tournament-member-role.enum';

export class ManageTournamentMemberDto {
  @IsInt()
  userId: number;

  @IsEnum(TournamentMemberRole)
  role: TournamentMemberRole;
}
