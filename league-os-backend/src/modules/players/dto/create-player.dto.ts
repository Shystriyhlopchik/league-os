import {
    IsBoolean,
    IsDateString, IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from 'class-validator';
import {PlayerPosition} from "../enums/player-position.enum";
import {PreferredFoot} from "../enums/preferred-foot.enum";

export class CreatePlayerDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    firstName: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    lastName: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    middleName?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    slug: string;

    @IsOptional()
    @IsDateString()
    birthDate?: string;

    @IsOptional()
    @IsUrl()
    photoUrl?: string;

    @IsOptional()
    @IsEnum(PreferredFoot)
    preferredFoot?: PreferredFoot;

    @IsOptional()
    @IsEnum(PlayerPosition)
    position?: PlayerPosition;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}