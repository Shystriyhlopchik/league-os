import { IsInt, Min } from 'class-validator';

export class ExtendPlayerSuspensionDto {
  @IsInt()
  @Min(1)
  extraMatches: number;

  @IsInt()
  @Min(1)
  manualDecisionId: number;
}
