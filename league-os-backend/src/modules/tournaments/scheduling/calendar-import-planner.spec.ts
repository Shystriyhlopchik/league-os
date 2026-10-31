import {
  importDateTime,
  planCalendarImport,
  ImportExistingMatch,
} from './calendar-import-planner';
import { CalendarImportReferences } from './calendar-spreadsheet.service';
import {
  PreviewScheduleImportDto,
  ScheduleImportRowDto,
} from '../dto/import-schedule.dto';

describe('Calendar import planning', () => {
  const refs: CalendarImportReferences = {
    groups: [
      { id: 1, key: 'А', name: 'Группа А' },
      { id: 2, key: 'Б', name: 'Группа Б' },
    ],
    teams: [
      { id: 101, name: 'Водоканал', groupId: 1 },
      { id: 102, name: 'КРИКС', groupId: 1 },
      { id: 103, name: 'Голд', groupId: 1 },
      { id: 104, name: 'Соляное', groupId: 2 },
    ],
    venues: [{ id: 5, name: 'Спартак' }],
  };
  const row: ScheduleImportRowDto = {
    row: 2,
    group: 'А',
    roundNumber: 1,
    home: 'Водоканал',
    away: 'КРИКС',
    date: '01.11.2026',
    time: '15:00',
    venue: 'Спартак',
  };
  const request = (rows = [row]): PreviewScheduleImportDto => ({
    rows,
    mode: 'append',
    mappings: [],
  });
  const old: ImportExistingMatch = {
    id: 1,
    stageId: 20,
    groupId: 1,
    roundNumber: 1,
    homeTeamId: 101,
    awayTeamId: 102,
    status: 'scheduled',
    venueId: 5,
    matchDatetime: new Date('2026-11-01T15:00:00'),
  };
  const plan = (
    dto = request(),
    existing: ImportExistingMatch[] = [],
    legs = 1,
  ) => planCalendarImport(dto, refs, existing, 20, legs);
  it('resolves names and preserves explicit Moscow wall-clock time', () => {
    const result = plan();
    expect(result.preview.valid).toBe(true);
    expect(result.planned[0]).toEqual({
      groupId: 1,
      roundNumber: 1,
      homeTeamId: 101,
      awayTeamId: 102,
      matchDatetime: '2026-11-01T15:00:00',
      venueId: 5,
    });
    expect(
      result.preview.warnings.some((w) => w.message.includes('дополните')),
    ).toBe(true);
  });
  it('supports explicit aliases but never creates an unknown team', () => {
    const dto = request([{ ...row, away: 'ФК Крикс' }]);
    expect(plan(dto).preview.valid).toBe(false);
    dto.mappings = [{ kind: 'team', source: 'ФК Крикс', id: 102 }];
    expect(plan(dto).preview.valid).toBe(true);
    dto.mappings[0].id = 999;
    expect(plan(dto).preview.valid).toBe(false);
  });
  it('blocks ambiguous team names until explicitly mapped', () => {
    const duplicate = {
      ...refs,
      teams: [...refs.teams, { id: 105, name: 'КРИКС', groupId: 2 }],
    };
    expect(
      planCalendarImport(request(), duplicate, [], 20, 1).preview.valid,
    ).toBe(false);
  });
  it.each([
    [{ ...row, away: 'Водоканал' }, 'сама с собой'],
    [{ ...row, away: 'Соляное' }, 'выбранной группе'],
    [{ ...row, date: '31.02.2026' }, 'Некорректная дата'],
    [{ ...row, time: '' }, 'вместе'],
    [{ ...row, time: '24:30' }, 'Некорректное время'],
  ] as const)('reports row-level errors', (value, text) => {
    const result = plan(request([{ ...value }]));
    expect(result.preview.valid).toBe(false);
    expect(result.preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 2,
          message: expect.stringContaining(text),
        }),
      ]),
    );
  });
  it('rejects duplicate pairs including reversed pairs and duplicate team-round slots', () => {
    const reversed = {
      ...row,
      row: 3,
      home: row.away,
      away: row.home,
      roundNumber: 2,
    };
    expect(plan(request([row, reversed])).preview.valid).toBe(false);
    expect(
      plan(
        request([row, { ...row, row: 3, away: 'Голд', time: '16:00' }]),
      ).preview.errors.some((e) => e.message.includes('этом туре')),
    ).toBe(true);
    expect(
      plan(request([row, { ...row, row: 3 }])).preview.errors.some((e) =>
        e.message.includes('повторяется'),
      ),
    ).toBe(true);
    expect(
      plan(request([row, { ...reversed, date: '08.11.2026' }]), [], 2).preview
        .valid,
    ).toBe(true);
  });
  it('checks venue and team bookings in the file and in other tournaments', () => {
    const elsewhere = { ...old, stageId: 99, homeTeamId: 501, awayTeamId: 502 };
    expect(
      plan(request(), [elsewhere]).preview.errors.some((e) =>
        e.message.includes('Площадка занята'),
      ),
    ).toBe(true);
    expect(
      plan(request(), [
        { ...elsewhere, homeTeamId: 101, venueId: 6 },
      ]).preview.errors.some((e) => e.message.includes('на это время')),
    ).toBe(true);
  });
  it('skips existing pairs on append but does not silently change their schedule', () => {
    expect(plan(request(), [old]).preview).toMatchObject({
      valid: true,
      skipCount: 1,
      createCount: 0,
    });
    expect(
      plan(request([{ ...row, time: '16:00' }]), [old]).preview.valid,
    ).toBe(false);
    expect(
      plan({ ...request(), mode: 'replace' }, [old]).preview,
    ).toMatchObject({ valid: true, cancelCount: 1, createCount: 1 });
  });
  it('permits unscheduled rows but warns that they must be completed before launch', () => {
    expect(
      plan(request([{ ...row, date: '', time: '', venue: '' }])).preview,
    ).toMatchObject({ valid: true, createCount: 1 });
  });
  it('invalidates the preview when the file, mappings or database changes', () => {
    const version = plan().preview.version;
    expect(plan().preview.version).toBe(version);
    expect(
      plan(request([{ ...row, roundNumber: 2 }])).preview.version,
    ).not.toBe(version);
    expect(plan(request(), [old]).preview.version).not.toBe(version);
  });
  it('handles leap days and ISO dates without timezone conversion', () => {
    expect(importDateTime('29.02.2028', '9:05')).toBe('2028-02-29T09:05:00');
    expect(importDateTime('2026-11-01', '15:00')).toBe('2026-11-01T15:00:00');
    expect(() => importDateTime('29.02.2026', '12:00')).toThrow();
  });
});
