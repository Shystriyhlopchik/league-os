import { PartialType } from '@nestjs/mapped-types';
import { CreateTournamentTeamDto } from './create-tournament-team.dto';

export class UpdateTournamentTeamDto extends PartialType(CreateTournamentTeamDto) {}