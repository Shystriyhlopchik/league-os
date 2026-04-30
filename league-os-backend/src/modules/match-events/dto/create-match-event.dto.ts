import {
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

import { MatchEventType } from '../enums/match-event-type.enum';

export class CreateMatchEventDto {
    @IsInt()
    matchId: number;

    @IsInt()
    teamId: number;

    @IsOptional()
    @IsInt()
    playerId?: number;

    @IsEnum(MatchEventType)
    eventType: MatchEventType;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(120)
    minute?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(30)
    addedMinute?: number;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;
}