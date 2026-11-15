import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    IsIn,
    Min,
    Max,
    MaxLength,
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
    @IsIn([1, 2])
    half?: number;

    @IsOptional()
    @IsInt()
    @Min(0) @Max(86400)
    second?: number;

    @IsOptional()
    @IsInt()
    @Min(1) @Max(1440)
    minute?: number;

    @IsOptional()
    @IsBoolean()
    autoResume?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(5000)
    description?: string;

    @IsOptional()
    @IsUUID()
    clientEventId?: string;
}
