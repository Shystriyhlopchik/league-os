import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CommunityRole } from './entities/community-member.entity';

export class CreateCommunityDto {
  @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(150) name: string;
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug: string;
  @IsInt() @Min(1) ownerUserId: number;
}

export class SetCommunityMemberDto {
  @IsEnum(CommunityRole) role: CommunityRole;
}

export class CommunityUsersQuery {
  @IsOptional() @IsString() @MaxLength(100) search = '';
  @IsOptional() @IsEnum(CommunityRole) role?: CommunityRole;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

export class CreateCommunityCompetitionDto {
  @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(150) name: string;
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug: string;
}

export class CreateCommunitySeasonDto {
  @IsInt() @Min(1) competitionId: number;
  @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(150) name: string;
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug: string;
  @IsInt() @Min(1900) @Max(2200) year: number;
}
