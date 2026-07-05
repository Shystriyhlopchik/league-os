import { IsInt } from 'class-validator';

export class ConfirmPlayerLinkDto {
  @IsInt()
  teamPlayerId: number;
}
