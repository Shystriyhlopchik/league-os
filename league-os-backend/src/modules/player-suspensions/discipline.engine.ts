import { BadRequestException, Injectable } from '@nestjs/common';

import type {
  AccumulatedYellowRuleV1,
  DisciplineTransitionRuleV1,
  SuspensionRuleV1,
} from '../tournament-rules/types/tournament-rules-config.type';

@Injectable()
export class DisciplineEngine {
  requiredAccumulatedSuspensions(
    yellowCards: number,
    rule: AccumulatedYellowRuleV1,
  ): number {
    if (yellowCards < rule.threshold) return 0;

    if (rule.progression === 'every_card_after_threshold') {
      return yellowCards - rule.threshold + 1;
    }

    return Math.floor(yellowCards / rule.threshold);
  }

  shouldCreateAccumulatedSuspension(params: {
    yellowCards: number;
    existingSuspensions: number;
    hasActiveAccumulatedSuspension: boolean;
    rule: AccumulatedYellowRuleV1;
  }): boolean {
    const required = this.requiredAccumulatedSuspensions(
      params.yellowCards,
      params.rule,
    );
    if (params.existingSuspensions >= required) return false;
    if (
      params.rule.progression === 'reset_after_suspension' &&
      params.hasActiveAccumulatedSuspension
    ) {
      return false;
    }
    return true;
  }

  shouldCarryPendingSuspension(rule: DisciplineTransitionRuleV1): boolean {
    return rule.carryPendingSuspensions;
  }

  extendMatchesRequired(
    currentMatchesRequired: number,
    extraMatches: number,
    rule: SuspensionRuleV1,
  ): number {
    if (!rule.allowManualExtension) {
      throw new BadRequestException(
        'Manual suspension extension is disabled by the stage rules',
      );
    }
    if (!Number.isInteger(extraMatches) || extraMatches <= 0) {
      throw new BadRequestException('extraMatches must be a positive integer');
    }
    return currentMatchesRequired + extraMatches;
  }
}
