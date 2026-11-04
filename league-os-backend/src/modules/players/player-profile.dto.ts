import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class PlayerProfileContextDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) teamId?: number;
}
export class PlayerProfileQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search = '';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}
export class PlayerIdentityChangeDto extends PlayerProfileContextDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion: number;
  @IsString() @Matches(/\S/) @MaxLength(100) firstName: string;
  @IsString() @Matches(/\S/) @MaxLength(100) lastName: string;
  @IsString() @MaxLength(100) middleName: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate: string;
  @IsString() @Matches(/\S/) @MaxLength(2000) reason: string;
}
export class ReviewPlayerIdentityDto {
  @IsIn(['approve', 'return']) decision: 'approve' | 'return';
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @IsOptional() @IsString() @MaxLength(2000) eligibilityComment?: string;
  @IsOptional() @IsString() @MaxLength(2000) duplicateComment?: string;
}
export class PlayerPhotoDto extends PlayerProfileContextDto {
  // Empty string denotes a profile without a photo; always required for concurrency control.
  @IsString() @MaxLength(1000) expectedPhotoUrl: string;
}
