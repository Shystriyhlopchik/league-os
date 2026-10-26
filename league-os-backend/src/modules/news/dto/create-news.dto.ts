import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateNewsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  communityId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  vkTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  vkText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  vkImageUrl?: string;

  @IsString()
  @Length(3, 180)
  title: string;

  @IsOptional()
  @IsString()
  @Length(3, 200)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsString()
  @Length(1, 50000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverUrl?: string;
}
