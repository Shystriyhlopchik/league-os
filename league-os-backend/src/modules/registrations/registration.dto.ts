import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RegistrationPolicyDto {
  @IsInt() @Min(1) @Max(12) maxPlayers: number;
  @IsInt() @Min(1) @Max(12) minPlayers: number;
  @IsInt() @Min(0) @Max(2) maxRepresentatives: number;
  @IsInt() @Min(1) @Max(12) minMatchPlayers: number;
  @IsInt() @Min(1) @Max(12) maxMatchPlayers: number;
  @IsBoolean() allowAmendments: boolean;
  @IsOptional() @IsISO8601() deadline?: string | null;
}
export class RepresentativeDto {
  @IsString() @MaxLength(200) name: string;
}
export class SaveApplicationDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  playerIds: number[];
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => RepresentativeDto)
  representatives: RepresentativeDto[];
  @IsOptional() @IsInt() @Min(1) expectedRevisionId?: number;
}
export class SubmitApplicationDto {
  @IsInt() @Min(1) revisionId: number;
}
export class ReviewApplicationDto extends SubmitApplicationDto {
  @IsIn(['approve', 'return']) decision: 'approve' | 'return';
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
export class AddExistingPlayerDto {
  @IsInt() @Min(1) playerId: number;
  @IsInt() @Min(1) @Max(99) shirtNumber: number;
}
export class ReviewTransferDto {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
