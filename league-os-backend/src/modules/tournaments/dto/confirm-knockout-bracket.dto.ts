import { IsBoolean, IsOptional } from 'class-validator';

export class ConfirmKnockoutBracketDto {
  @IsOptional()
  @IsBoolean()
  replaceCurrent?: boolean;
}
