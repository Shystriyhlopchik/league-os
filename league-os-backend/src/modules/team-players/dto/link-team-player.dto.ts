import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt,
    IsOptional,
    Max,
    Min,
} from 'class-validator';

import { PlayerPosition } from '../../players/enums/player-position.enum';

export class LinkTeamPlayerDto {
    @IsInt()
    teamId: number;

    @IsInt()
    playerId: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(99)
    shirtNumber?: number;

    @IsOptional()
    @IsEnum(PlayerPosition)
    position?: PlayerPosition;

    @IsOptional()
    @IsBoolean()
    isCaptain?: boolean;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsDateString()
    joinedAt?: string;

    @IsOptional()
    @IsDateString()
    leftAt?: string;
}