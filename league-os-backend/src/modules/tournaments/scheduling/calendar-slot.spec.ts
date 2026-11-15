import { calendarSlotTiming } from './calendar-slot';
import type { MatchRulesV1 } from '../../tournament-rules/types/tournament-rules-config.type';

describe('Calendar default occupied slot', () => {
  const rules = (periods: number, periodDurationMinutes: number | null) =>
    ({ periods, periodDurationMinutes } as MatchRulesV1);
  it.each([[2, 20, 55], [2, 25, 65], [2, 45, 105], [3, 15, 60]])(
    'calculates %s × %s + 15 = %s minutes', (periods, minutes, expected) => {
      expect(calendarSlotTiming(rules(periods, minutes)).defaultDurationMinutes).toBe(expected);
    },
  );
  it('does not invent missing legacy match settings', () => {
    expect(calendarSlotTiming()).toEqual({ defaultDurationMinutes: null, slotTiming: null });
    expect(calendarSlotTiming(rules(2, null)).defaultDurationMinutes).toBeNull();
  });
  it('exposes the formula used by the interface', () => {
    expect(calendarSlotTiming(rules(2, 20)).slotTiming).toEqual({
      periods: 2, periodDurationMinutes: 20, changeoverMinutes: 15,
    });
  });
});
