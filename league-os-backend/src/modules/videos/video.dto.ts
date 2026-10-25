import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SaveVideoDto {
  @IsString()
  @MaxLength(180)
  @Matches(/\S/, { message: 'Укажите название видео' })
  title: string;
  @IsString() @MaxLength(5000) source: string;
  @IsOptional()
  @IsString()
  @Matches(/^\/uploads\/videos\/[0-9a-f-]{36}\.(jpg|png|webp)$/)
  coverUrl?: string | null;
  @IsIn(['draft', 'published']) status: 'draft' | 'published';
  @IsBoolean() showOnHome: boolean;
  @IsInt() @Min(0) @Max(9999) sortOrder: number;
  @IsOptional() @IsInt() @Min(1) tournamentId?: number | null;
  @IsOptional() @IsInt() @Min(1) matchId?: number | null;
}
export class VideosQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) communityId?: number;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
export class VideoOptionsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) tournamentId?: number;
}
