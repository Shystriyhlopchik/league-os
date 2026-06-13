import { IsEnum } from 'class-validator';

import { MatchEventType } from '../../match-events/enums/match-event-type.enum';

export class StartEventRecordingDto {
    @IsEnum(MatchEventType)
    eventType: MatchEventType;
}