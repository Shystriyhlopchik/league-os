import { BadRequestException, Injectable } from '@nestjs/common';
import { Workbook, CellValue } from 'exceljs';
import { unzipSync } from 'fflate';
import { ScheduleImportRowDto } from '../dto/import-schedule.dto';

export const CALENDAR_FILE_LIMIT = 5 * 1024 * 1024;
export const CALENDAR_HEADERS = [
  'Группа',
  'Тур',
  'Хозяева',
  'Гости',
  'Дата',
  'Время',
  'Площадка',
];
export interface CalendarImportReferences {
  groups: { id: number; key: string; name: string }[];
  teams: { id: number; name: string; groupId: number }[];
  venues: { id: number; name: string }[];
}
export const normalizeCalendarName = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

@Injectable()
export class CalendarSpreadsheetService {
  async read(file?: {
    buffer: Buffer;
    originalname: string;
  }): Promise<ScheduleImportRowDto[]> {
    if (
      !file ||
      !/\.xlsx$/i.test(file.originalname) ||
      !file.buffer.length ||
      file.buffer.length > CALENDAR_FILE_LIMIT
    )
      throw new BadRequestException(
        'Загрузите файл .xlsx размером не более 5 МБ',
      );
    const workbook = new Workbook();
    try {
      let size = 0,
        count = 0;
      unzipSync(file.buffer, {
        filter: (entry) => {
          size += entry.originalSize;
          if (
            ++count > 1000 ||
            size > 25 * 1024 * 1024 ||
            /vbaProject\.bin$/i.test(entry.name)
          )
            throw new Error('archive limits');
          return false;
        },
      });
      await workbook.xlsx.load(
        file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    } catch {
      throw new BadRequestException(
        'Не удалось прочитать Excel. Файл повреждён, защищён или превышает допустимый распакованный размер 25 МБ',
      );
    }
    const sheet = workbook.getWorksheet('Календарь') ?? workbook.worksheets[0];
    if (!sheet || sheet.rowCount > 1001)
      throw new BadRequestException(
        'В календаре допускается не более 1000 строк матчей',
      );
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, column) => {
      headers[column - 1] = cell.text.trim();
    });
    const columns = CALENDAR_HEADERS.map(
      (h) =>
        headers.findIndex(
          (v) => normalizeCalendarName(v ?? '') === normalizeCalendarName(h),
        ) + 1,
    );
    const namedHeaders = headers.filter(Boolean).map(normalizeCalendarName);
    if (
      columns.some((c) => c === 0) ||
      new Set(namedHeaders).size !== namedHeaders.length
    )
      throw new BadRequestException(
        `Первая строка должна содержать уникальные заголовки: ${CALENDAR_HEADERS.join(', ')}`,
      );
    const rows: ScheduleImportRowDto[] = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const values = columns.map((column, index) =>
        this.cell(
          row.getCell(column).value,
          index,
          workbook.properties.date1904,
          number,
        ),
      );
      if (values.every((v) => !v)) return;
      const roundNumber = Number(values[1]);
      if (
        !Number.isInteger(roundNumber) ||
        roundNumber < 1 ||
        roundNumber > 10000
      )
        throw new BadRequestException(
          `Строка ${number}: тур должен быть целым числом от 1 до 10000`,
        );
      if (
        values.some((v) => v.length > 255) ||
        values[4].length > 20 ||
        values[5].length > 10
      )
        throw new BadRequestException(
          `Строка ${number}: слишком длинное значение ячейки`,
        );
      rows.push({
        row: number,
        group: values[0],
        roundNumber,
        home: values[2],
        away: values[3],
        date: values[4],
        time: values[5],
        venue: values[6],
      });
    });
    if (!rows.length)
      throw new BadRequestException(
        'В файле нет матчей. Заполните лист «Календарь», начиная со второй строки',
      );
    return rows;
  }

  async template(
    name: string,
    refs: CalendarImportReferences,
  ): Promise<Buffer> {
    const book = new Workbook();
    const sheet = book.addWorksheet('Календарь', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    sheet.columns = CALENDAR_HEADERS.map((header, i) => ({
      header,
      width: [18, 10, 32, 32, 17, 14, 32][i],
    }));
    sheet.getRow(1).font = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF25302D' },
    };
    sheet.getRow(1).height = 26;
    sheet.autoFilter = 'A1:G1';
    const reference = book.addWorksheet('Справочник', {
      views: [{ showGridLines: false }],
    });
    reference.columns = [
      { width: 18 },
      { width: 30 },
      { width: 4 },
      { width: 32 },
      { width: 18 },
      { width: 4 },
      { width: 32 },
      { width: 4 },
      { width: 95 },
    ];
    reference.getRow(1).values = [
      'Группа',
      'Название группы',
      '',
      'Команда',
      'Группа команды',
      '',
      'Площадка',
      '',
      'Как заполнить календарь',
    ];
    reference.getRow(1).font = { name: 'Arial', size: 11, bold: true };
    refs.groups.forEach((g, i) => {
      reference.getCell(i + 2, 1).value = g.key;
      reference.getCell(i + 2, 2).value = g.name;
    });
    refs.teams.forEach((t, i) => {
      reference.getCell(i + 2, 4).value = t.name;
      reference.getCell(i + 2, 5).value =
        refs.groups.find((g) => g.id === t.groupId)?.key ?? '';
    });
    refs.venues.forEach((v, i) => {
      reference.getCell(i + 2, 7).value = v.name;
    });
    [
      name,
      'Матчи вводите на листе «Календарь», начиная со строки 2. Не меняйте заголовки.',
      'Группа, тур и две команды обязательны. Используйте названия из справочника.',
      'Дата: ДД.ММ.ГГГГ или дата Excel. Время: ЧЧ:ММ, московское (UTC+3).',
      'Дату и время заполняйте вместе или оставьте оба поля пустыми.',
      'Площадку можно указать позже. Перед запуском она обязательна для каждого матча.',
      'Одна команда — не более одного матча в одном туре. Максимум 1000 матчей.',
      'После загрузки проверьте предпросмотр и подтвердите импорт на сайте.',
    ].forEach((text, i) => {
      reference.getCell(i + 2, 9).value = text;
    });
    for (let row = 2; row <= 1001; row++) {
      for (const [column, refColumn, count] of [
        [1, 'A', refs.groups.length],
        [3, 'D', refs.teams.length],
        [4, 'D', refs.teams.length],
        [7, 'G', refs.venues.length],
      ] as const) {
        if (count)
          sheet.getCell(row, column).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [
              `'Справочник'!$${refColumn}$2:$${refColumn}$${count + 1}`,
            ],
          };
      }
      sheet.getCell(row, 2).dataValidation = {
        type: 'whole',
        operator: 'between',
        formulae: [1, 10000],
        allowBlank: true,
      };
      sheet.getCell(row, 5).numFmt = 'dd.mm.yyyy';
      sheet.getCell(row, 6).numFmt = 'hh:mm';
    }
    return Buffer.from(await book.xlsx.writeBuffer());
  }

  private cell(
    value: CellValue,
    column: number,
    date1904: boolean | undefined,
    row: number,
  ): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && !(value instanceof Date)) {
      if ('formula' in value || 'sharedFormula' in value || 'error' in value)
        throw new BadRequestException(
          `Строка ${row}: формулы и ошибки Excel не поддерживаются. Вставьте значения`,
        );
      if ('richText' in value)
        return value.richText
          .map((t) => t.text)
          .join('')
          .trim();
      if ('text' in value) return String(value.text).trim();
      throw new BadRequestException(
        `Строка ${row}: неподдерживаемый тип ячейки`,
      );
    }
    if (column === 4 || column === 5) {
      const date =
        value instanceof Date
          ? value
          : typeof value === 'number'
            ? new Date(
                (date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) +
                  value * 86400000,
              )
            : undefined;
      if (date && Number.isFinite(date.getTime()))
        return column === 4
          ? date.toISOString().slice(0, 10)
          : date.toISOString().slice(11, 16);
    }
    return String(value).trim();
  }
}
