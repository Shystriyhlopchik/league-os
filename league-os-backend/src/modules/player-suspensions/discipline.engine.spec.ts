import { BadRequestException } from '@nestjs/common';

import { DisciplineEngine } from './discipline.engine';

describe('DisciplineEngine', () => {
  const engine = new DisciplineEngine();

  it('creates a suspension for the third and every later yellow card', () => {
    const rule = {
      enabled: true as const,
      threshold: 3,
      suspensionMatches: 1,
      progression: 'every_card_after_threshold' as const,
    };

    expect(engine.requiredAccumulatedSuspensions(2, rule)).toBe(0);
    expect(engine.requiredAccumulatedSuspensions(3, rule)).toBe(1);
    expect(engine.requiredAccumulatedSuspensions(4, rule)).toBe(2);
    expect(engine.requiredAccumulatedSuspensions(5, rule)).toBe(3);
  });

  it('supports reset and repeated-threshold counter behaviour', () => {
    const resetRule = {
      enabled: true as const,
      threshold: 3,
      suspensionMatches: 1,
      progression: 'reset_after_suspension' as const,
    };
    const repeatedRule = {
      ...resetRule,
      progression: 'repeat_every_threshold' as const,
    };

    expect(engine.requiredAccumulatedSuspensions(6, resetRule)).toBe(2);
    expect(engine.requiredAccumulatedSuspensions(7, repeatedRule)).toBe(2);
    expect(
      engine.shouldCreateAccumulatedSuspension({
        yellowCards: 6,
        existingSuspensions: 1,
        hasActiveAccumulatedSuspension: true,
        rule: resetRule,
      }),
    ).toBe(false);
  });

  it('validates manual extension settings', () => {
    expect(
      engine.extendMatchesRequired(1, 2, {
        enabled: true,
        minimumMatches: 1,
        allowManualExtension: true,
      }),
    ).toBe(3);
    expect(() =>
      engine.extendMatchesRequired(1, 1, {
        enabled: true,
        minimumMatches: 1,
        allowManualExtension: false,
      }),
    ).toThrow(BadRequestException);
  });
});
