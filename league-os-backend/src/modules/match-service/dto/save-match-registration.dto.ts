import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SaveMatchRegistrationDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  teamPlayerIds: number[];
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason?: string;
}
export class ReturnMatchRosterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}
