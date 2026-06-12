import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';

import { MatchEventType } from '../../match-events/enums/match-event-type.enum';

export class CreateMatchServiceEventDto {
    @IsEnum(MatchEventType)
    eventType: MatchEventType;

    @IsInt()
    teamId: number;

    @IsOptional()
    @IsInt()
    playerId?: number;

    @IsOptional()
    @IsInt()
    assistPlayerId?: number;

    @IsOptional()
    @IsInt()
    secondaryPlayerId?: number;

    @IsOptional()
    @IsInt()
    half?: number;

    @IsOptional()
    @IsInt()
    second?: number;

    @IsOptional()
    @IsInt()
    minute?: number;

    @IsOptional()
    @IsBoolean()
    autoResume?: boolean;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsUUID()
    clientEventId?: string;
}