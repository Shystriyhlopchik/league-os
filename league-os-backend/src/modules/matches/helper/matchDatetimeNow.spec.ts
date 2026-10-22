import {
  MATCH_TIME_ZONE,
  matchDateTimeAtOrAfterNow,
  matchDateTimeBeforeNow,
} from './matchDatetimeNow';

describe('matchDatetimeNow', () => {
  it.each([
    [matchDateTimeBeforeNow, '<'],
    [matchDateTimeAtOrAfterNow, '>='],
  ] as const)(
    'builds a %s comparison using the Moscow wall-clock time',
    (createOperator, comparisonOperator) => {
      const operator = createOperator();

      expect(operator.type).toBe('raw');
      expect(operator.getSql?.('match.match_datetime')).toBe(
        `match.match_datetime ${comparisonOperator} (CURRENT_TIMESTAMP AT TIME ZONE :matchTimeZone)`,
      );
      expect(operator.objectLiteralParameters).toEqual({
        matchTimeZone: MATCH_TIME_ZONE,
      });
    },
  );
});
