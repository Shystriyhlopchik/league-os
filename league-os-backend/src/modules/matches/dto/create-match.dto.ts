import {
    IsDateString,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
} from 'class-validator';

import { MatchStatus } from '../enums/match-status.enum';

export class CreateMatchDto {
    @IsInt()
    tournamentId: number;

    @IsInt()
    homeTeamId: number;

    @IsInt()
    awayTeamId: number;

    @IsOptional()
    @IsInt()
    venueId?: number;

    @IsOptional()
    @IsDateString()
    matchDatetime?: string;

    @IsOptional()
    @IsString()
    round?: string;

    @IsOptional()
    @IsEnum(MatchStatus)
    status?: MatchStatus;
}