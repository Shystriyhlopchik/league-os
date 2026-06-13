import {
    ArrayNotEmpty,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CreateMatchServiceEventDto } from './create-match-service-event.dto';

export class SyncMatchServiceEventsDto {
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => CreateMatchServiceEventDto)
    events: CreateMatchServiceEventDto[];
}