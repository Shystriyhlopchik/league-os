import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MatchEventType } from '../../match-events/enums/match-event-type.enum';

export class CreateManualMatchEventDto {
  @IsInt()
  teamId: number;

  @IsEnum(MatchEventType)
  eventType: MatchEventType;

  @IsInt()
  @Min(0)
  @Max(200)
  minute: number;

  @IsInt()
  @Min(1)
  @Max(2)
  half: number;

  @IsOptional()
  @IsInt()
  playerId?: number;

  @IsOptional()
  @IsInt()
  assistPlayerId?: number;
}
