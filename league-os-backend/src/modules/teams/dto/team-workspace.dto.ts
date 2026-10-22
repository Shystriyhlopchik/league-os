import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class TeamProfileDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  @Matches(/\S/)
  name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) shortName?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) city?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) village?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(2100)
  foundedYear?: number | null;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() secondaryColor?: string;
}
export class TeamProfileVersionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion: number;
}
export class UpdateTeamProfileDto extends PartialType(TeamProfileDto) {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion: number;
}
export class RequestTeamAccessDto {
  @IsInt() @Min(1) teamId: number;
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(1000) reason: string;
}
export class ReviewTeamAccessDto {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?: string;
}
export class SetTeamManagerDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) username: string;
  @IsIn(['owner', 'manager']) role: 'owner' | 'manager';
}
