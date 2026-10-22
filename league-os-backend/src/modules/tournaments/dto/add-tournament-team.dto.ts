import { IsInt, Min } from 'class-validator';

export class AddTournamentTeamDto {
  @IsInt()
  @Min(1)
  teamId: number;
}
