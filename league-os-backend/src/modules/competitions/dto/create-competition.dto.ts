import {
    IsBoolean,
    IsHexColor,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from 'class-validator';

export class CreateCompetitionDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    slug: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsUrl()
    logoUrl?: string;

    @IsOptional()
    @IsHexColor()
    colorPrimary?: string;

    @IsOptional()
    @IsHexColor()
    colorSecondary?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    type?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    region?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}