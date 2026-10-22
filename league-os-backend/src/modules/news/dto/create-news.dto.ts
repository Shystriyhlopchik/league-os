import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateNewsDto {
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
