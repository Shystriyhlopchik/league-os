import { Workbook } from 'exceljs';
import { strToU8, zipSync } from 'fflate';
import {
  CalendarSpreadsheetService,
  CALENDAR_HEADERS,
} from './calendar-spreadsheet.service';

describe('CalendarSpreadsheetService', () => {
  const service = new CalendarSpreadsheetService();
  const file = async (values: unknown[][], date1904 = false) => {
    const book = new Workbook();
    book.properties.date1904 = date1904;
    const sheet = book.addWorksheet('Календарь');
    sheet.addRows(values);
    return {
      originalname: 'calendar.xlsx',
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    };
  };
  it('generates an empty template with the actual tournament reference lists', async () => {
    const buffer = await service.template('Дворовая лига', {
      groups: [{ id: 1, key: 'А', name: 'Группа А' }],
      teams: [{ id: 1, name: 'Водоканал', groupId: 1 }],
      venues: [{ id: 5, name: 'Спартак' }],
    });
    const book = new Workbook();
    await book.xlsx.load(
      buffer as unknown as Parameters<typeof book.xlsx.load>[0],
    );
    expect(book.getWorksheet('Календарь')!.getRow(1).values).toEqual([
      undefined,
      ...CALENDAR_HEADERS,
    ]);
    expect(book.getWorksheet('Справочник')!.getCell('D2').value).toBe(
      'Водоканал',
    );
    expect(
      book.getWorksheet('Календарь')!.getCell('C2').dataValidation.type,
    ).toBe('list');
    await expect(
      service.read({ originalname: 'calendar.xlsx', buffer }),
    ).rejects.toThrow('нет матчей');
  });
  it('reads text dates, ignores empty rows and retains Excel row numbers', async () => {
    const rows = await service.read(
      await file([
        CALENDAR_HEADERS,
        [],
        ['А', 1, 'Водоканал', 'КРИКС', '01.11.2026', '15:00', 'Спартак'],
      ]),
    );
    expect(rows[0]).toMatchObject({
      row: 3,
      date: '01.11.2026',
      time: '15:00',
      roundNumber: 1,
    });
  });
  it.each([false, true])(
    'reads native Excel dates and numeric time (1904 system: %s)',
    async (date1904) => {
      const result = await service.read(
        await file(
          [
            CALENDAR_HEADERS,
            [
              'А',
              1,
              'Водоканал',
              'КРИКС',
              new Date('2026-11-01T00:00:00Z'),
              15 / 24,
              'Спартак',
            ],
          ],
          date1904,
        ),
      );
      expect(result[0]).toMatchObject({ date: '2026-11-01', time: '15:00' });
    },
  );
  it('rejects formulas even when Excel supplies a cached result', async () => {
    await expect(
      service.read(
        await file([
          CALENDAR_HEADERS,
          ['А', { formula: '1+1', result: 2 }, 'Водоканал', 'КРИКС'],
        ]),
      ),
    ).rejects.toThrow('формулы');
  });
  it('rejects invalid headers, round numbers and malformed files', async () => {
    await expect(
      service.read(await file([['Тур', 'Хозяева']])),
    ).rejects.toThrow('заголовки');
    await expect(
      service.read(
        await file([CALENDAR_HEADERS, ['А', 1.5, 'Водоканал', 'КРИКС']]),
      ),
    ).rejects.toThrow('целым');
    await expect(
      service.read({
        originalname: 'calendar.xlsx',
        buffer: Buffer.from('not zip'),
      }),
    ).rejects.toThrow('прочитать');
    await expect(
      service.read({
        originalname: 'calendar.xls',
        buffer: Buffer.from('not zip'),
      }),
    ).rejects.toThrow('.xlsx');
  });
  it('rejects oversized files and compressed archives before loading Excel', async () => {
    await expect(
      service.read({
        originalname: 'calendar.xlsx',
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow('5 МБ');
    const zip = zipSync({
      'xl/worksheets/sheet1.xml': new Uint8Array(26 * 1024 * 1024),
      '[Content_Types].xml': strToU8('invalid'),
    });
    await expect(
      service.read({ originalname: 'calendar.xlsx', buffer: Buffer.from(zip) }),
    ).rejects.toThrow('25 МБ');
  });
});
