import { createHash } from 'node:crypto';
import { PreviewScheduleImportDto, ScheduleImportRowDto } from '../dto/import-schedule.dto';
import { CalendarImportReferences, normalizeCalendarName } from './calendar-spreadsheet.service';
import { formatLocalDateTime } from '../../matches/helper/formatLocalDateTime';

export interface ImportExistingMatch {
  id: number; stageId?: number; groupId?: number; roundNumber?: number;
  homeTeamId: number; awayTeamId: number; status: string;
  matchDatetime?: Date | null; venueId?: number;
}
export interface ImportPlannedMatch {
  groupId: number; roundNumber: number; homeTeamId: number; awayTeamId: number;
  matchDatetime: string | null; venueId: number | null;
}
export interface ImportIssue { row: number; message: string }

export function importDateTime(date: string, time: string): string | null {
  if (!date.trim() && !time.trim()) return null;
  if (!date.trim() || !time.trim()) throw new Error('Заполните дату и время вместе или оставьте оба поля пустыми');
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(date.trim());
  const [year, month, day] = iso ? iso.slice(1).map(Number) : ru ? [Number(ru[3]), Number(ru[2]), Number(ru[1])] : [0, 0, 0];
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2199 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day)
    throw new Error('Некорректная дата. Используйте ДД.ММ.ГГГГ или ГГГГ-ММ-ДД');
  if (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59) throw new Error('Некорректное время. Используйте ЧЧ:ММ (МСК)');
  return `${calendar.toISOString().slice(0, 10)}T${clock[1].padStart(2, '0')}:${clock[2]}:00`;
}

export function planCalendarImport(dto: PreviewScheduleImportDto, refs: CalendarImportReferences, existing: ImportExistingMatch[], stageId: number, legs: number) {
  const errors: ImportIssue[] = [], warnings: ImportIssue[] = [];
  const kinds = ['group', 'team', 'venue'] as const;
  const options = { group: refs.groups, team: refs.teams, venue: refs.venues };
  const explicit = new Map<string, number>();
  for (const mapping of dto.mappings) {
    const key = `${mapping.kind}:${normalizeCalendarName(mapping.source)}`;
    if (explicit.has(key) && explicit.get(key) !== mapping.id) errors.push({ row: 0, message: `Неоднозначное сопоставление: ${mapping.source}` });
    if (!options[mapping.kind].some(o => o.id === mapping.id)) errors.push({ row: 0, message: `Сопоставление «${mapping.source}» ссылается на недоступную запись` });
    explicit.set(key, mapping.id);
  }
  const sources = kinds.flatMap(kind => {
    const names = [...new Set(dto.rows.flatMap(r => kind === 'team' ? [r.home, r.away] : [kind === 'group' ? r.group : r.venue]).filter(Boolean))];
    return names.map(source => {
      const normalized = normalizeCalendarName(source);
      const matches = options[kind].filter(o => normalizeCalendarName(o.name) === normalized || ('key' in o && normalizeCalendarName(String(o.key)) === normalized));
      const id = explicit.get(`${kind}:${normalized}`) ?? (matches.length === 1 ? matches[0].id : null);
      return { kind, source, id };
    });
  });
  const resolve = (kind: typeof kinds[number], name: string) => sources.find(s => s.kind === kind && s.source === name)?.id ?? null;
  const stageMatches = existing.filter(m => m.stageId === stageId);
  const remaining = dto.mode === 'replace' ? existing.filter(m => m.stageId !== stageId) : [...existing];
  const planned: ImportPlannedMatch[] = [];
  const seenRows = new Set<number>(), seenFixtures = new Set<string>();
  let skipped = 0;
  const rows = dto.rows.map(row => {
    const rowErrors: string[] = [], rowWarnings: string[] = [];
    const groupId = resolve('group', row.group), homeTeamId = resolve('team', row.home), awayTeamId = resolve('team', row.away), venueId = row.venue ? resolve('venue', row.venue) : null;
    if (seenRows.has(row.row)) rowErrors.push('Повторяется номер строки Excel');
    seenRows.add(row.row);
    if (!groupId) rowErrors.push(`Не определена группа «${row.group}»`);
    if (!homeTeamId) rowErrors.push(`Не определена команда хозяев «${row.home}»`);
    if (!awayTeamId) rowErrors.push(`Не определена команда гостей «${row.away}»`);
    if (row.venue && !venueId) rowErrors.push(`Не определена площадка «${row.venue}»`);
    if (homeTeamId && homeTeamId === awayTeamId) rowErrors.push('Команда не может играть сама с собой');
    for (const id of [homeTeamId, awayTeamId]) if (id && refs.teams.find(t => t.id === id)?.groupId !== groupId) rowErrors.push('Обе команды должны состоять в выбранной группе');
    let matchDatetime: string | null = null;
    try { matchDatetime = importDateTime(row.date, row.time); } catch (error) { rowErrors.push((error as Error).message); }
    if (!matchDatetime) rowWarnings.push('Дата и время не назначены');
    if (!venueId) rowWarnings.push('Площадка не назначена');
    const fixtureKey = `${groupId}:${row.roundNumber}:${homeTeamId}:${awayTeamId}`;
    if (seenFixtures.has(fixtureKey)) rowErrors.push('Такая пара в этом туре повторяется в файле');
    seenFixtures.add(fixtureKey);
    const identical = dto.mode === 'append' ? stageMatches.find(m => `${m.groupId}:${m.roundNumber}:${m.homeTeamId}:${m.awayTeamId}` === fixtureKey) : undefined;
    let action: 'add' | 'skip' | 'error' = 'add';
    if (identical) {
      if ((matchDatetime && formatLocalDateTime(identical.matchDatetime) !== matchDatetime) || (venueId && venueId !== identical.venueId)) rowErrors.push('Матч уже есть с другой датой или площадкой. Исправьте его вручную или выберите замену календаря');
      else { action = 'skip'; rowWarnings.push('Матч уже есть в календаре и будет пропущен'); }
    } else if (groupId && homeTeamId && awayTeamId) {
      const groupMatches = remaining.filter(m => m.stageId === stageId && m.groupId === groupId);
      if (groupMatches.filter(m => [m.homeTeamId, m.awayTeamId].includes(homeTeamId) && [m.homeTeamId, m.awayTeamId].includes(awayTeamId)).length >= legs) rowErrors.push(`Для этой пары уже предусмотрено ${legs} встреч. Проверьте число кругов`);
      if (groupMatches.some(m => m.roundNumber === row.roundNumber && [m.homeTeamId, m.awayTeamId].some(id => id === homeTeamId || id === awayTeamId))) rowErrors.push('Одна из команд уже играет в этом туре');
      if (matchDatetime) {
        const sameTime = remaining.filter(m => formatLocalDateTime(m.matchDatetime) === matchDatetime);
        if (venueId && sameTime.some(m => m.venueId === venueId)) rowErrors.push('Площадка занята другим матчем на это время');
        if (sameTime.some(m => [m.homeTeamId, m.awayTeamId].some(id => id === homeTeamId || id === awayTeamId))) rowErrors.push('У команды уже есть матч на это время');
      }
    }
    if (rowErrors.length) action = 'error';
    if (action === 'add') {
      const match = { groupId: groupId!, roundNumber: row.roundNumber, homeTeamId: homeTeamId!, awayTeamId: awayTeamId!, matchDatetime, venueId };
      planned.push(match);
      remaining.push({ ...match, id: -row.row, stageId, status: 'scheduled', matchDatetime: matchDatetime ? new Date(matchDatetime) : null, venueId: venueId ?? undefined });
    }
    if (action === 'skip') skipped++;
    errors.push(...rowErrors.map(message => ({ row: row.row, message })));
    warnings.push(...rowWarnings.map(message => ({ row: row.row, message })));
    return { ...row, groupId, homeTeamId, awayTeamId, venueId, matchDatetime, action, errors: rowErrors, warnings: rowWarnings };
  });
  const expected = refs.groups.reduce((sum, g) => { const n = refs.teams.filter(t => t.groupId === g.id).length; return sum + n * (n - 1) / 2 * legs; }, 0);
  const totalAfterImport = (dto.mode === 'append' ? stageMatches.length : 0) + planned.length;
  if (totalAfterImport !== expected) warnings.push({ row: 0, message: `После импорта будет ${totalAfterImport} из ${expected} необходимых матчей. До запуска дополните календарь` });
  const version = createHash('sha256').update(JSON.stringify({ stageId, legs, mode: dto.mode, rows: dto.rows.map(r => [r.row, r.group, r.roundNumber, r.home, r.away, r.date, r.time, r.venue]), sources, refs, existing: existing.map(m => [m.id, m.stageId, m.groupId, m.roundNumber, m.homeTeamId, m.awayTeamId, m.status, formatLocalDateTime(m.matchDatetime), m.venueId]).sort((a, b) => Number(a[0]) - Number(b[0])) })).digest('hex');
  return { planned, preview: { valid: errors.length === 0, version, sourceRows: dto.rows, rows, sources, references: refs, errors, warnings, createCount: planned.length, skipCount: skipped, cancelCount: dto.mode === 'replace' ? stageMatches.length : 0, totalAfterImport, expectedMatches: expected } };
}
