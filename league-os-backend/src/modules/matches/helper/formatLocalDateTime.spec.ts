import { formatLocalDateTime } from './formatLocalDateTime';

describe('formatLocalDateTime', () => {
  it('returns a local datetime without a timezone suffix', () => {
    const date = new Date(2026, 6, 23, 19, 20, 0);

    expect(formatLocalDateTime(date)).toBe('2026-07-23T19:20:00');
  });

  it('returns null when the match datetime is absent', () => {
    expect(formatLocalDateTime(undefined)).toBeNull();
  });
});
