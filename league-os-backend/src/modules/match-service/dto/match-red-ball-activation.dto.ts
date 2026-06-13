import { IsInt } from 'class-validator';

export class ActivateRedBallDto {
    @IsInt()
    teamId: number;
}