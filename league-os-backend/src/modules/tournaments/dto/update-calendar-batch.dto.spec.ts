import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PreviewCalendarBatchDto,
  SaveCalendarBatchDto,
} from './update-calendar-batch.dto';
const valid = {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  reason: 'Новое время аренды',
  changes: [
    {
      id: 1,
      expectedRevision: 0,
      roundNumber: 2,
      postponed: false,
      matchDatetime: '2030-01-01T18:00',
      venueId: 2,
      durationMinutes: 75,
    },
  ],
};
describe('Calendar batch DTO', () => {
  it('accepts a complete request', async () =>
    expect(
      await validate(plainToInstance(PreviewCalendarBatchDto, valid)),
    ).toHaveLength(0));
  it('accepts a deliberate postponement without date/venue', async () =>
    expect(
      await validate(
        plainToInstance(PreviewCalendarBatchDto, {
          ...valid,
          changes: [
            {
              id: 1,
              expectedRevision: 0,
              postponed: true,
              durationMinutes: 75,
            },
          ],
        }),
      ),
    ).toHaveLength(0));
  it.each([
    { changes: [] },
    { changes: [{ ...valid.changes[0], expectedRevision: -1 }] },
    { changes: [{ ...valid.changes[0], roundNumber: null }] },
    { changes: [{ ...valid.changes[0], durationMinutes: 0 }] },
    {
      changes: [
        { ...valid.changes[0], postponed: false, matchDatetime: undefined },
      ],
    },
    { reason: ' ' },
    { requestId: 'not-uuid' },
  ])('rejects invalid input %p', async (extra) => {
    expect(
      (
        await validate(
          plainToInstance(PreviewCalendarBatchDto, { ...valid, ...extra }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('requires a checked version for committing', async () => {
    expect(
      (await validate(plainToInstance(SaveCalendarBatchDto, valid))).some(
        (e) => e.property === 'expectedVersion',
      ),
    ).toBe(true);
  });
});
