import { IsInt, Min } from 'class-validator';

export class PublishTournamentDto {
  @IsInt()
  @Min(1)
  ruleVersionId: number;
}
