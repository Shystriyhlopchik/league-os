import { PartialType } from '@nestjs/mapped-types';

import { CreateTournamentRuleVersionDto } from './create-tournament-rule-version.dto';

export class UpdateTournamentRuleVersionDto extends PartialType(
  CreateTournamentRuleVersionDto,
) {}
