import { validate } from 'class-validator';
import { ManualScheduleMatchDto } from './manual-schedule-match.dto';

describe('ManualScheduleMatchDto', () => {
  const valid = { groupId: 1, roundNumber: 2, homeTeamId: 3, awayTeamId: 4 };
  it('accepts a complete pairing', async () => {
    expect(
      await validate(Object.assign(new ManualScheduleMatchDto(), valid)),
    ).toHaveLength(0);
  });
  it.each(['groupId', 'roundNumber', 'homeTeamId', 'awayTeamId'])(
    'requires a positive integer %s',
    async (field) => {
      for (const invalid of [undefined, 0, -1, 1.5, '2']) {
        const errors = await validate(
          Object.assign(new ManualScheduleMatchDto(), valid, {
            [field]: invalid,
          }),
        );
        expect(errors.some((e) => e.property === field)).toBe(true);
      }
    },
  );
});
