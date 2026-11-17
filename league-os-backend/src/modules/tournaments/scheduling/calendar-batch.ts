import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import { MatchEntity } from '../../matches/entities/match.entity';
import { MatchStatus } from '../../matches/enums/match-status.enum';
import { MatchRoundType } from '../../matches/enums/match-round-type.enum';
import { formatLocalDateTime } from '../../matches/helper/formatLocalDateTime';
import { TournamentEntity } from '../entities/tournaments.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../../tournament-stages/enums/tournament-stage-type.enum';
import { VenueEntity } from '../../venues/entities/venue.entity';
import { applicationEditWindow } from '../../registrations/application-edit-window';
import {
  PreviewCalendarBatchDto,
  SaveCalendarBatchDto,
} from '../dto/update-calendar-batch.dto';

export interface CalendarIssue {
  matchId?: number;
  otherMatchId?: number;
  field: string;
  message: string;
}
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const state = (m: MatchEntity) => ({
  roundNumber: m.roundNumber ?? null,
  matchDatetime: formatLocalDateTime(m.matchDatetime) ?? null,
  venueId: m.venueId ?? null,
  durationMinutes: m.durationMinutes ?? 60,
  postponed: !!m.postponedAt,
});
const name = (m: MatchEntity) =>
  m.homeTeam && m.awayTeam
    ? `${m.homeTeam.name} — ${m.awayTeam.name} (№${m.id})`
    : `Матч №${m.id}`;
const roundTypes = [MatchRoundType.GROUP_ROUND, MatchRoundType.ROUND_ROBIN];
export function canMoveCalendarRound(
  m: MatchEntity,
  stages: TournamentStageEntity[],
  format?: string,
) {
  if (m.bracketSnapshotId || m.bracketPosition) return false;
  const stage = stages.find((s) => s.id === m.stageId);
  if (stage?.type === TournamentStageType.KNOCKOUT || format === 'knockout')
    return false;
  return m.roundType ? roundTypes.includes(m.roundType) : !!m.roundNumber;
}

/** Validate only touched pairs; old unrelated inconsistencies must not block a safe correction. */
export function calendarConflicts(
  final: MatchEntity[],
  external: MatchEntity[],
  changedIds: Set<number>,
  movedIds: Set<number>,
): CalendarIssue[] {
  const issues: CalendarIssue[] = [];
  const relevant = final.filter((m) => m.status !== MatchStatus.CANCELLED);
  const all = [...relevant, ...external];
  const recorded = new Set<string>();
  for (const a of relevant.filter((m) => changedIds.has(m.id))) {
    for (const b of all) {
      if (a.id === b.id) continue;
      const key = [a.id, b.id].sort((x, y) => x - y).join(':');
      if (recorded.has(key)) continue;
      recorded.add(key);
      const sameTeam = [a.homeTeamId, a.awayTeamId]
        .filter(Boolean)
        .some((t) => t === b.homeTeamId || t === b.awayTeamId);
      if (
        sameTeam &&
        a.tournamentId === b.tournamentId &&
        a.stageId === b.stageId &&
        a.groupId === b.groupId &&
        a.roundNumber &&
        a.roundNumber === b.roundNumber &&
        (movedIds.has(a.id) || movedIds.has(b.id))
      ) {
        issues.push({
          matchId: a.id,
          otherMatchId: b.id,
          field: 'roundNumber',
          message: `${name(a)} и ${name(b)}: команда уже играет в ${a.roundNumber}-м туре. Перенесите обе встречи согласованно.`,
        });
      }
      if (
        !a.matchDatetime ||
        !b.matchDatetime ||
        a.postponedAt ||
        b.postponedAt
      )
        continue;
      const startA = a.matchDatetime.getTime(),
        startB = b.matchDatetime.getTime();
      if (
        startA < startB + (b.durationMinutes ?? 60) * 60000 &&
        startB < startA + (a.durationMinutes ?? 60) * 60000 &&
        (sameTeam || (a.venueId && a.venueId === b.venueId))
      ) {
        issues.push({
          matchId: a.id,
          otherMatchId: b.id,
          field: 'matchDatetime',
          message: `${name(a)} и ${name(b)}: ${sameTeam ? 'команда занята' : 'площадка занята'} в пересекающихся слотах.`,
        });
      }
    }
  }
  // Playoff numbering and participant sources never change; dates still follow the bracket.
  const bracketIds = new Set(
    final
      .filter((m) => changedIds.has(m.id))
      .map((m) => m.bracketSnapshotId)
      .filter(Boolean),
  );
  for (const m of final.filter(
    (m) => m.bracketSnapshotId && bracketIds.has(m.bracketSnapshotId),
  )) {
    if (!m.matchDatetime || m.postponedAt) continue;
    const bracket = final.filter(
      (x) => x.bracketSnapshotId === m.bracketSnapshotId,
    );
    const first = m.bracketPosition?.endsWith(':L2')
      ? bracket.find(
          (x) =>
            x.bracketPosition === m.bracketPosition!.replace(/:L2$/, ':L1'),
        )
      : undefined;
    const sources = [m.homeParticipantSource, m.awayParticipantSource].flatMap(
      (s) =>
        s?.type === 'match_outcome'
          ? bracket.filter(
              (x) =>
                x.bracketPosition?.replace(/:L[12]$/, '') === s.bracketPosition,
            )
          : [],
    );
    for (const source of [...(first ? [first] : []), ...sources]) {
      if (
        source.postponedAt ||
        !source.matchDatetime ||
        source.matchDatetime.getTime() +
          (source.durationMinutes ?? 60) * 60000 >
          m.matchDatetime.getTime()
      ) {
        // An unknown upstream date cannot be silently treated as an available time.
        issues.push({
          matchId: m.id,
          otherMatchId: source.id,
          field: 'matchDatetime',
          message: `${name(m)} должен проходить после завершения ${name(source)}. Сначала назначьте предыдущую встречу.`,
        });
      }
    }
  }
  return issues;
}

export async function editCalendarBatch(
  db: DataSource,
  tournamentId: number,
  dto: PreviewCalendarBatchDto | SaveCalendarBatchDto,
  actorId: number,
  save: boolean,
) {
  if (!dto.changes?.length || dto.changes.length > 200 || !dto.reason?.trim())
    throw new BadRequestException(
      'Укажите изменения и причину (не более 200 матчей за раз)',
    );
  const ids = dto.changes.map((c) => c.id);
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException('Один матч указан в пакете несколько раз');
  const ordered = [...dto.changes]
    .sort((a, b) => a.id - b.id)
    .map((c) => ({
      id: c.id,
      expectedRevision: c.expectedRevision,
      roundNumber: c.roundNumber,
      postponed: c.postponed,
      matchDatetime: c.postponed ? null : c.matchDatetime?.slice(0, 19),
      venueId: c.postponed ? null : c.venueId,
      durationMinutes: c.durationMinutes,
    }));
  const requestHash = digest({
    actorId,
    reason: dto.reason.trim(),
    changes: ordered,
  });
  return db.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(78203, $1)', [
      tournamentId,
    ]);
    const tournament = await manager.findOne(TournamentEntity, {
      where: { id: tournamentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!tournament) throw new NotFoundException('Турнир не найден');
    const matches = await manager.find(MatchEntity, {
      where: { tournamentId },
      relations: { homeTeam: true, awayTeam: true },
      order: { id: 'ASC' },
    });
    const receipts = matches.flatMap((m) =>
      (m.scheduleHistory ?? [])
        .filter((e) => e.requestId === dto.requestId)
        .map((e) => ({ m, e })),
    );
    if (receipts.length) {
      if (
        receipts.some(
          ({ e }) => e.requestHash !== requestHash || e.actorId !== actorId,
        )
      )
        throw new ConflictException(
          'Идентификатор сохранения уже использован для других изменений',
        );
      return {
        valid: true,
        replayed: true,
        updatedCount: receipts.length,
        requestId: dto.requestId,
        issues: [],
        warnings: [],
        changes: [],
      };
    }
    if (
      ['finished', 'cancelled'].includes(tournament.status) ||
      (tournament.lifecycleStatus &&
        !['draft', 'published', 'in_progress'].includes(
          tournament.lifecycleStatus,
        ))
    )
      throw new ConflictException(
        'Календарь завершённого турнира недоступен для изменения',
      );
    if (
      tournament.lifecycleStatus === 'draft' &&
      tournament.registrationRequired &&
      tournament.registrationStatus !== 'closed'
    )
      throw new ConflictException(
        'Сначала закройте приём заявок и распределите команды по группам',
      );
    // Same order as single edits/signatures: tournament -> match rows -> global booking lock.
    const locked = await manager.find(MatchEntity, {
      where: { id: In(ids), tournamentId },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (locked.length !== ids.length)
      throw new NotFoundException(
        'Один из матчей не найден в выбранном турнире',
      );
    await manager.query('SELECT pg_advisory_xact_lock(78201, 1)');
    const stages = await manager.find(TournamentStageEntity, {
      where: { tournamentId },
    });
    const venues = await manager.find(VenueEntity, {
      where: { isActive: true },
    });
    const final = matches.map((m) => Object.assign(new MatchEntity(), m));
    const issues: CalendarIssue[] = [],
      changedIds = new Set<number>(),
      movedIds = new Set<number>();
    for (const c of dto.changes) {
      const original = locked.find((m) => m.id === c.id)!,
        m = final.find((m) => m.id === c.id)!;
      if (original.status !== MatchStatus.SCHEDULED)
        issues.push({
          matchId: c.id,
          field: 'status',
          message: `${name(m)} уже начат, завершён или отменён. Обновите календарь.`,
        });
      if ((original.scheduleRevision ?? 0) !== c.expectedRevision)
        issues.push({
          matchId: c.id,
          field: 'revision',
          message: `${name(m)} изменён другим организатором. Обновите календарь и согласуйте правки.`,
        });
      if (
        c.roundNumber !== undefined &&
        c.roundNumber !== original.roundNumber
      ) {
        if (!canMoveCalendarRound(m, stages, tournament.format))
          issues.push({
            matchId: c.id,
            field: 'roundNumber',
            message: `${name(m)}: нельзя менять раунд сетки плей-офф.`,
          });
        else if (
          !matches.some(
            (x) =>
              x.stageId === m.stageId &&
              x.groupId === m.groupId &&
              x.roundNumber === c.roundNumber &&
              x.status !== MatchStatus.CANCELLED,
          )
        )
          issues.push({
            matchId: c.id,
            field: 'roundNumber',
            message: `${name(m)}: выберите существующий тур того же этапа и группы.`,
          });
        movedIds.add(c.id);
        m.roundNumber = c.roundNumber;
        m.round = m.round?.match(/round\s+\d+/i)
          ? m.round.replace(/round\s+\d+/i, `round ${c.roundNumber}`)
          : `Тур ${c.roundNumber}`;
      }
      if (
        !Number.isInteger(c.durationMinutes) ||
        c.durationMinutes < 1 ||
        c.durationMinutes > 480
      )
        issues.push({
          matchId: c.id,
          field: 'durationMinutes',
          message: `${name(m)}: длительность слота должна быть от 1 до 480 минут.`,
        });
      m.durationMinutes = c.durationMinutes;
      if (c.postponed) {
        m.matchDatetime = undefined;
        m.venueId = undefined;
        m.postponedAt = original.postponedAt ?? new Date();
      } else {
        const date = new Date(c.matchDatetime!);
        if (
          !Number.isFinite(date.getTime()) ||
          formatLocalDateTime(date)?.slice(0, 16) !==
            c.matchDatetime?.slice(0, 16)
        )
          issues.push({
            matchId: c.id,
            field: 'matchDatetime',
            message: `${name(m)}: укажите корректные дату и время.`,
          });
        else m.matchDatetime = date;
        if (!venues.some((v) => v.id === c.venueId))
          issues.push({
            matchId: c.id,
            field: 'venueId',
            message: `${name(m)}: площадка недоступна.`,
          });
        m.venueId = c.venueId;
        m.postponedAt = null;
      }
      if (JSON.stringify(state(original)) !== JSON.stringify(state(m)))
        changedIds.add(c.id);
    }
    const dated = final.filter(
      (m) => changedIds.has(m.id) && m.matchDatetime && !m.postponedAt,
    );
    let external: MatchEntity[] = [];
    if (dated.length) {
      const teams = [
        ...new Set(
          dated.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean),
        ),
      ];
      const grounds = [...new Set(dated.map((m) => m.venueId).filter(Boolean))];
      const start = new Date(
        Math.min(...dated.map((m) => m.matchDatetime!.getTime())),
      );
      const end = new Date(
        Math.max(
          ...dated.map(
            (m) => m.matchDatetime!.getTime() + m.durationMinutes * 60000,
          ),
        ),
      );
      external = await manager
        .getRepository(MatchEntity)
        .createQueryBuilder('m')
        .leftJoinAndSelect('m.homeTeam', 'home')
        .leftJoinAndSelect('m.awayTeam', 'away')
        .where(
          'm.tournament_id <> :tournamentId AND m.status <> :cancelled AND m.postponed_at IS NULL',
          { tournamentId, cancelled: MatchStatus.CANCELLED },
        )
        .andWhere(
          '(m.venue_id IN (:...grounds) OR m.home_team_id IN (:...teams) OR m.away_team_id IN (:...teams))',
          { grounds: grounds.concat([-1]), teams: teams.concat([-1]) },
        )
        .andWhere(
          "m.match_datetime < CAST(:end AS timestamp) AND m.match_datetime + m.duration_minutes * interval '1 minute' > CAST(:start AS timestamp)",
          { start: formatLocalDateTime(start), end: formatLocalDateTime(end) },
        )
        .orderBy('m.id', 'ASC')
        .getMany();
    }
    issues.push(...calendarConflicts(final, external, changedIds, movedIds));
    const now = new Date();
    const beforeWindow = applicationEditWindow(matches, now),
      afterWindow = applicationEditWindow(final, now);
    const warnings: string[] = [];
    if (
      tournament.registrationRequired &&
      !tournament.applicationsLockedAt &&
      beforeWindow.locksAt !== afterWindow.locksAt
    )
      warnings.push(
        `Начало ограничения заявок с 4-го тура изменится: ${beforeWindow.locksAt ?? 'дата не назначена'} → ${afterWindow.locksAt ?? 'дата не назначена'}. Уже наступившая блокировка сохраняется.`,
      );
    const changes = final
      .filter((m) => changedIds.has(m.id))
      .map((m) => ({
        id: m.id,
        match: name(m),
        before: state(matches.find((x) => x.id === m.id)!),
        after: state(m),
      }));
    const version = digest({
      tournament: {
        status: tournament.status,
        lifecycleStatus: tournament.lifecycleStatus,
        rules: tournament.activeRuleVersionId,
        locked: tournament.applicationsLockedAt,
      },
      matches: matches.map((m) => ({
        id: m.id,
        status: m.status,
        revision: m.scheduleRevision,
        ...state(m),
      })),
      external: external.map((m) => ({
        id: m.id,
        status: m.status,
        revision: m.scheduleRevision,
        ...state(m),
      })),
      venues: venues.map((v) => v.id).sort((a, b) => a - b),
      requestHash,
    });
    if (!save)
      return {
        valid: !issues.length,
        version,
        issues,
        warnings,
        changes,
        updatedCount: 0,
        replayed: false,
      };
    if (issues.length)
      throw new ConflictException({
        message: 'Календарь не сохранён. Исправьте указанные конфликты.',
        issues,
      });
    if ((dto as SaveCalendarBatchDto).expectedVersion !== version)
      throw new ConflictException(
        'Календарь изменился после проверки. Повторно проверьте изменения перед сохранением.',
      );
    if (!changedIds.size)
      return {
        valid: true,
        updatedCount: 0,
        replayed: false,
        requestId: dto.requestId,
      };
    if (
      tournament.registrationRequired &&
      !tournament.applicationsLockedAt &&
      (beforeWindow.locked || afterWindow.locked)
    ) {
      tournament.applicationsLockedAt = new Date(
        beforeWindow.locked
          ? (beforeWindow.locksAt ?? now)
          : (afterWindow.locksAt ?? now),
      );
      await manager.save(tournament);
    }
    for (const m of final.filter((m) => changedIds.has(m.id))) {
      const before = matches.find((x) => x.id === m.id)!;
      m.scheduleRevision = (before.scheduleRevision ?? 0) + 1;
      m.postponementReason = m.postponedAt ? dto.reason.trim() : null;
      m.scheduleHistory = [
        ...(before.scheduleHistory ?? []),
        {
          at: now.toISOString(),
          actorId,
          reason: dto.reason.trim(),
          requestId: dto.requestId,
          requestHash,
          before: state(before),
          after: state(m),
        },
      ];
      // TypeORM ignores undefined; use explicit SQL NULL to clear a booking.
      m.matchDatetime = (m.matchDatetime ?? null) as unknown as Date;
      m.venueId = (m.venueId ?? null) as unknown as number;
      await manager.save(MatchEntity, m);
    }
    await manager.query(
      'UPDATE match_rosters SET is_approved = false, approved_at = NULL, approved_by_user_id = NULL WHERE match_id = ANY($1::int[])',
      [[...changedIds]],
    );
    return {
      valid: true,
      updatedCount: changedIds.size,
      replayed: false,
      requestId: dto.requestId,
    };
  });
}
