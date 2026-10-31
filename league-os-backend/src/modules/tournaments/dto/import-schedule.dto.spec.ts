import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmScheduleImportDto, PreviewScheduleImportDto } from './import-schedule.dto';

describe('Calendar import request validation', () => {
  const row = { row: 2, group: 'A', roundNumber: 1, home: 'Водоканал', away: 'КРИКС', date: '', time: '', venue: '' };
  const body = () => ({ mode: 'append', mappings: [], rows: [row] });
  it('accepts an unscheduled row and a checked confirmation', async () => {
    expect(await validate(plainToInstance(PreviewScheduleImportDto, body()))).toHaveLength(0);
    expect(await validate(plainToInstance(ConfirmScheduleImportDto, { ...body(), expectedVersion: 'a'.repeat(64) }))).toHaveLength(0);
  });
  it.each([
    { mode: 'delete' }, { rows: [] }, { rows: Array(1001).fill(row) },
    { rows: [{ ...row, roundNumber: 1.5 }] }, { rows: [{ ...row, home: undefined }] },
    { mappings: [{ kind: 'team', source: 'Водоканал', id: 0 }] },
    { mappings: [{ kind: 'other', source: 'Водоканал', id: 1 }] },
  ])('rejects malformed or oversized import bodies', async changes => {
    expect((await validate(plainToInstance(PreviewScheduleImportDto, { ...body(), ...changes }))).length).toBeGreaterThan(0);
  });
  it('requires a real preview digest and the exact replacement acknowledgement', async () => {
    expect((await validate(plainToInstance(ConfirmScheduleImportDto, body()))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(ConfirmScheduleImportDto, { ...body(), expectedVersion: 'a'.repeat(64), confirmation: 'yes' }))).length).toBeGreaterThan(0);
  });
});
