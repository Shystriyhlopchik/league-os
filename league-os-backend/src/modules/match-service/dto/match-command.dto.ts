import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateMatchServiceEventDto } from './create-match-service-event.dto';
import { FinalizeMatchResultDto } from './finalize-match-result.dto';
import { MatchEventType } from '../../match-events/enums/match-event-type.enum';

export const MATCH_COMMANDS = [
  'start',
  'pause',
  'resume',
  'finish-half',
  'start-second-half',
  'finish',
  'start-recording',
  'cancel-recording',
  'event',
  'cancel-event',
  'red-ball',
  'sign',
  'recover',
] as const;
export class MatchCommandDto {
  @IsUUID() id: string;
  @IsIn(MATCH_COMMANDS) action: (typeof MATCH_COMMANDS)[number];
  @IsInt() @Min(0) expectedRevision: number;
  @IsDateString() occurredAt: string;
  @IsInt() @Min(0) @Max(86400) elapsedSeconds: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateMatchServiceEventDto)
  event?: CreateMatchServiceEventDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => FinalizeMatchResultDto)
  result?: FinalizeMatchResultDto;
  @IsOptional()
  @IsIn(['goal', 'own_goal', 'yellow_card', 'second_yellow_card', 'red_card'])
  eventType?: MatchEventType;
  @IsOptional() @IsInt() @Min(1) eventId?: number;
  @IsOptional() @IsUUID() eventClientId?: string;
  @IsOptional() @IsInt() @Min(1) teamId?: number;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
