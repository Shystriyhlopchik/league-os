import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelTournamentDecisionDto {
  @IsString()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
