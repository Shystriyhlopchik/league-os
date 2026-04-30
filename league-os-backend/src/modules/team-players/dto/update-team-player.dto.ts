import { PartialType } from '@nestjs/mapped-types';
import { CreateTeamPlayerDto } from './create-team-player.dto';

export class UpdateTeamPlayerDto extends PartialType(CreateTeamPlayerDto) {}