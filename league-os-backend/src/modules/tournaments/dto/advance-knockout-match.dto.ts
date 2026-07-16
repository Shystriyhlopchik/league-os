import { IsInt, IsOptional, Min } from 'class-validator';

export class AdvanceKnockoutMatchDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  winnerTeamId?: number;
}
