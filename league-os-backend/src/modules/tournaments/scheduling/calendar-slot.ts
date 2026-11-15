import type { MatchRulesV1 } from '../../tournament-rules/types/tournament-rules-config.type';

/** Only regular playing time is booked; extra time and penalties are not guaranteed. */
export function calendarSlotTiming(rules?: MatchRulesV1) {
  const periods = rules?.periods;
  const minutes = rules?.periodDurationMinutes;
  if (!Number.isInteger(periods) || !periods || periods < 1 ||
      !Number.isInteger(minutes) || !minutes || minutes < 1) {
    return { defaultDurationMinutes: null, slotTiming: null };
  }
  return {
    defaultDurationMinutes: periods * minutes + 15,
    slotTiming: { periods, periodDurationMinutes: minutes, changeoverMinutes: 15 },
  };
}
