import { ManagedCalendar } from '../../entities/tournament-application/tournament-application.api';
export type CalendarMatch = ManagedCalendar['matches'][number];
export interface CalendarDraftRow {
    id: number;
    roundNumber: number | null;
    date: string;
    time: string;
    venueId: number;
    durationMinutes: number;
    postponed: boolean;
}
export function calendarDraftRow(m: CalendarMatch): CalendarDraftRow {
    return {
        id: m.id,
        roundNumber: m.roundNumber ?? null,
        date: m.matchDatetime?.slice(0, 10) ?? '',
        time: m.matchDatetime?.slice(11, 16) ?? '',
        venueId: m.venueId ?? 0,
        // Existing bookings remain factual until a row is explicitly edited.
        durationMinutes: m.durationMinutes ?? m.defaultDurationMinutes ?? 60,
        postponed: !!m.postponed,
    };
}
/** Wall-clock arithmetic, independent of browser timezone and DST. */
export function shiftCalendarTime(date: string, time: string, minutes: number) {
    if (
        !Number.isFinite(minutes) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    )
        return null;
    const value = new Date(`${date}T${time}:00Z`);
    if (
        !Number.isFinite(value.getTime()) ||
        value.toISOString().slice(0, 10) !== date
    )
        return null;
    value.setUTCMinutes(value.getUTCMinutes() + minutes);
    if (!Number.isFinite(value.getTime())) return null;
    return {
        date: value.toISOString().slice(0, 10),
        time: value.toISOString().slice(11, 16),
    };
}
