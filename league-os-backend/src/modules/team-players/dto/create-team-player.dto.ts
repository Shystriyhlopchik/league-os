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
} from 'class-validator';

import { PlayerPosition } from '../../players/enums/player-position.enum';
import { PreferredFoot } from '../../players/enums/preferred-foot.enum';
import { Transform, Type } from 'class-transformer';

export class CreateTeamPlayerDto {
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @IsString()
    @IsNotEmpty()
    lastName: string;

    @IsString()
    @IsOptional()
    middleName?: string;

    @IsInt()
    @Type(() => Number)
    @Min(1)
    @Max(99)
    @IsOptional()
    shirtNumber?: number;

    @IsEnum(PlayerPosition)
    @IsOptional()
    position?: PlayerPosition;

    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    @IsOptional()
    isCaptain?: boolean;

    @IsDateString()
    @IsOptional()
    birthDate?: string;

    @IsEnum(PreferredFoot)
    @IsOptional()
    preferredFoot?: PreferredFoot;
}
