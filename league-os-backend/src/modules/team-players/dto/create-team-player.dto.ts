import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsDateString,
    Max,
    Min,
    Matches,
    MaxLength,
} from 'class-validator';

import { PlayerPosition } from '../../players/enums/player-position.enum';
import { PreferredFoot } from '../../players/enums/preferred-foot.enum';
import { Transform, Type } from 'class-transformer';

export class CreateTeamPlayerDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/\S/)
    @MaxLength(100)
    firstName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/\S/)
    @MaxLength(100)
    lastName: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    middleName?: string;

    @IsInt()
    @Type(() => Number)
    @Min(1)
    @Max(99)
    shirtNumber: number;

    @IsEnum(PlayerPosition)
    @IsOptional()
    position?: PlayerPosition;

    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    @IsOptional()
    isCaptain?: boolean;

    @IsDateString()
    birthDate: string;

    @IsEnum(PreferredFoot)
    @IsOptional()
    preferredFoot?: PreferredFoot;
}
