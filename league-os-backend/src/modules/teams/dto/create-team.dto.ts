import {
    IsBoolean,
    IsHexColor,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateTeamDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    shortName?: string;

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
    primaryColor?: string;

    @IsOptional()
    @IsHexColor()
    secondaryColor?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    city?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    village?: string;

    @IsOptional()
    @IsInt()
    @Min(1800)
    @Max(2100)
    foundedYear?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}