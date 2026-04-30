import { IsInt, IsOptional, Min } from 'class-validator';

export class CreateStandingDto {
    @IsInt()
    tournamentId: number;

    @IsInt()
    teamId: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    position?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    played?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    wins?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    draws?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    losses?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    goalsFor?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    goalsAgainst?: number;

    @IsOptional()
    @IsInt()
    goalDifference?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    points?: number;
}