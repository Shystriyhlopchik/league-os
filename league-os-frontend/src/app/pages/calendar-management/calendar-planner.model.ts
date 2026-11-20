import {
    CalendarDraftRow,
    CalendarMatch,
    calendarDraftRow,
    shiftCalendarTime,
} from './calendar-draft';

export interface PlannerScope {
    key: string;
    stageId?: number;
    groupId?: number;
    label: string;
}
export interface PlannerDay {
    key: string;
    scopeKey: string;
    roundNumber: number | null;
    date: string;
    label: string;
}
export interface PlannerSlot {
    key: string;
    scopeKey: string;
    roundNumber: number | null;
    date: string;
    time: string;
    venueId: number;
    durationMinutes: number;
}
export interface PlannerAssignment {
    rows: CalendarDraftRow[];
    error?: string;
    occupied?: CalendarMatch;
}
export const plannerScopeKey = (
    m: Pick<CalendarMatch, 'stageId' | 'groupId'>,
) => `${m.stageId ?? 'legacy'}:${m.groupId ?? 'none'}`;
export const plannerDayKey = (
    scope: string,
    round: number | null,
    date: string,
) => `${scope}|${round ?? 'none'}|${date}`;
export const plannerSlotKey = (
    s: Omit<PlannerSlot, 'key' | 'durationMinutes'>,
) =>
    `${plannerDayKey(s.scopeKey, s.roundNumber, s.date)}|${s.venueId}|${s.time}`;
export const plannerRow = (
    m: CalendarMatch,
    rows: Record<number, CalendarDraftRow>,
) => rows[m.id] ?? calendarDraftRow(m);
export const plannerAssigned = (r: CalendarDraftRow) =>
    !r.postponed && !!r.date && !!r.time && r.venueId > 0;
export function plannerOccupants(
    matches: CalendarMatch[],
    rows: Record<number, CalendarDraftRow>,
    slot: PlannerSlot,
) {
    // Occupancy is physical, not scoped by group/round. Other groups cannot be overwritten.
    return matches.filter((m) => {
        const r = plannerRow(m, rows);
        return (
            m.status !== 'cancelled' &&
            plannerAssigned(r) &&
            r.date === slot.date &&
            r.time === slot.time &&
            r.venueId === slot.venueId
        );
    });
}
export function plannerAssign(
    matches: CalendarMatch[],
    rows: Record<number, CalendarDraftRow>,
    id: number,
    slot: PlannerSlot,
    confirmed = false,
): PlannerAssignment {
    const m = matches.find((x) => x.id === id);
    const failure = (error: string): PlannerAssignment => ({ rows: [], error });
    if (!m || m.status !== 'scheduled')
        return failure('Можно переносить только ещё не начатые матчи.');
    if (plannerScopeKey(m) !== slot.scopeKey)
        return failure(
            'Матч должен оставаться в своём этапе и спортивной группе.',
        );
    if (
        !shiftCalendarTime(slot.date, slot.time, 0) ||
        !Number.isInteger(slot.venueId) ||
        slot.venueId <= 0 ||
        !Number.isInteger(slot.durationMinutes) ||
        slot.durationMinutes < 1 ||
        slot.durationMinutes > 480
    )
        return failure(
            'Укажите корректные дату, время, площадку и длительность слота.',
        );
    const source = plannerRow(m, rows);
    if (source.roundNumber !== slot.roundNumber) {
        if (
            slot.roundNumber === null ||
            !m.canChangeRound ||
            !matches.some(
                (x) =>
                    plannerScopeKey(x) === slot.scopeKey &&
                    x.roundNumber === slot.roundNumber &&
                    x.status !== 'cancelled',
            )
        )
            return failure(
                'Выберите существующий тур той же группы. Раунды плей-офф менять нельзя.',
            );
    }
    const occupants = plannerOccupants(matches, rows, slot).filter(
        (x) => x.id !== id,
    );
    if (occupants.length > 1)
        return failure(
            'В этом слоте уже несколько матчей. Сначала устраните конфликт расписания.',
        );
    const other = occupants[0];
    if (
        other &&
        (other.status !== 'scheduled' ||
            plannerScopeKey(other) !== slot.scopeKey)
    )
        return failure(
            'Слот занят начатым матчем или встречей другой группы. Выберите свободный слот.',
        );
    if (other && !confirmed) return { rows: [], occupied: other };
    const next: CalendarDraftRow = {
        ...source,
        roundNumber: slot.roundNumber,
        date: slot.date,
        time: slot.time,
        venueId: slot.venueId,
        durationMinutes: slot.durationMinutes,
        postponed: false,
    };
    const changes = [next];
    if (other) {
        const previous = plannerRow(other, rows);
        if (plannerAssigned(source)) {
            if (
                source.roundNumber !== previous.roundNumber &&
                !other.canChangeRound
            )
                return failure(
                    'Второй матч нельзя перенести в другой раунд плей-офф.',
                );
            changes.push({
                ...previous,
                date: source.date,
                time: source.time,
                venueId: source.venueId,
                durationMinutes: source.durationMinutes,
                roundNumber: source.roundNumber,
                postponed: false,
            });
        } else
            changes.push({
                ...previous,
                date: '',
                time: '',
                venueId: 0,
                postponed: true,
            });
    }
    return { rows: changes };
}

export function plannerOverlapIds(
    matches: CalendarMatch[],
    rows: Record<number, CalendarDraftRow>,
) {
    const assigned = matches.filter(
        (m) => m.status !== 'cancelled' && plannerAssigned(plannerRow(m, rows)),
    );
    const ids = new Set<number>();
    for (let i = 0; i < assigned.length; i++)
        for (let j = i + 1; j < assigned.length; j++) {
            const a = assigned[i],
                b = assigned[j],
                ra = plannerRow(a, rows),
                rb = plannerRow(b, rows);
            const startA = Date.parse(`${ra.date}T${ra.time}:00Z`),
                startB = Date.parse(`${rb.date}T${rb.time}:00Z`);
            if (
                startA < startB + rb.durationMinutes * 60000 &&
                startB < startA + ra.durationMinutes * 60000 &&
                (ra.venueId === rb.venueId ||
                    [a.homeTeamId, a.awayTeamId]
                        .filter(Boolean)
                        .some((t) => t === b.homeTeamId || t === b.awayTeamId))
            ) {
                ids.add(a.id);
                ids.add(b.id);
            }
        }
    return ids;
}
