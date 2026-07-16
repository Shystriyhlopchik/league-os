import { IsBoolean, IsOptional } from 'class-validator';

export class ConfirmQualificationDto {
  @IsOptional()
  @IsBoolean()
  replaceCurrent?: boolean;
}
