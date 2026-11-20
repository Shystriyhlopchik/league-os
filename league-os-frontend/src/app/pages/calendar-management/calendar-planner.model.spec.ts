import {
    CalendarDraftRow,
    CalendarMatch,
    calendarDraftRow,
} from './calendar-draft';
import {
    PlannerSlot,
    plannerAssign,
    plannerOccupants,
    plannerOverlapIds,
    plannerScopeKey,
    plannerSlotKey,
} from './calendar-planner.model';

describe('Desktop calendar assignment model', () => {
    let matches: CalendarMatch[];
    let rows: Record<number, CalendarDraftRow>;
    const slot = (values: Partial<PlannerSlot> = {}): PlannerSlot => {
        const s = {
            scopeKey: '1:1',
            roundNumber: 1,
            date: '2030-11-20',
            time: '18:00',
            venueId: 3,
            durationMinutes: 75,
            ...values,
        };
        return { ...s, key: plannerSlotKey(s) };
    };
    beforeEach(() => {
        matches = [
            {
                id: 1,
                home: 'Арман',
                away: 'Полено',
                homeTeamId: 11,
                awayTeamId: 12,
                status: 'scheduled',
                stageId: 1,
                groupId: 1,
                roundNumber: 1,
                canChangeRound: true,
                postponed: true,
                matchDatetime: null,
            },
            {
                id: 2,
                home: 'Соляное',
                away: 'Голд',
                homeTeamId: 21,
                awayTeamId: 22,
                status: 'scheduled',
                stageId: 1,
                groupId: 1,
                roundNumber: 1,
                canChangeRound: true,
                matchDatetime: '2030-11-20T19:15:00',
                venueId: 3,
                durationMinutes: 75,
            },
            {
                id: 3,
                home: 'ЧЭТК',
                away: 'ЧТСиГХ',
                homeTeamId: 31,
                awayTeamId: 32,
                status: 'scheduled',
                stageId: 1,
                groupId: 1,
                roundNumber: 2,
                canChangeRound: true,
                matchDatetime: '2030-11-27T18:00:00',
                venueId: 4,
                durationMinutes: 60,
            },
        ];
        rows = Object.fromEntries(
            matches.map((m) => [m.id, calendarDraftRow(m)]),
        );
    });
    it('assigns an unbooked match without mutating the source', () => {
        const before = JSON.stringify({ matches, rows });
        const plan = plannerAssign(matches, rows, 1, slot());
        expect(plan.error).toBeUndefined();
        expect(plan.rows).toEqual([
            {
                id: 1,
                roundNumber: 1,
                date: '2030-11-20',
                time: '18:00',
                venueId: 3,
                durationMinutes: 75,
                postponed: false,
            },
        ]);
        expect(JSON.stringify({ matches, rows })).toBe(before);
    });
    it('moves between existing rounds in the same sporting group', () => {
        expect(
            plannerAssign(matches, rows, 1, slot({ roundNumber: 2 })).rows[0]
                .roundNumber,
        ).toBe(2);
        expect(
            plannerAssign(matches, rows, 1, slot({ roundNumber: 99 })).error,
        ).toContain('существующий тур');
        expect(
            plannerAssign(matches, rows, 1, slot({ roundNumber: null })).rows,
        ).toEqual([]);
        expect(
            plannerAssign(matches, rows, 1, slot({ scopeKey: '1:2' })).error,
        ).toContain('группе');
    });
    it('requires explicit confirmation for a booked slot', () => {
        const plan = plannerAssign(matches, rows, 1, slot({ time: '19:15' }));
        expect(plan.rows).toEqual([]);
        expect(plan.occupied?.id).toBe(2);
    });
    it('swaps two bookings in one plan, retaining the destination slot lengths', () => {
        rows[1] = {
            ...rows[1],
            date: '2030-11-19',
            time: '20:00',
            venueId: 4,
            durationMinutes: 55,
            postponed: false,
        };
        const plan = plannerAssign(
            matches,
            rows,
            1,
            slot({ time: '19:15' }),
            true,
        );
        expect(plan.rows.length).toBe(2);
        expect(plan.rows[0]).toEqual(
            jasmine.objectContaining({
                time: '19:15',
                venueId: 3,
                durationMinutes: 75,
            }),
        );
        expect(plan.rows[1]).toEqual(
            jasmine.objectContaining({
                id: 2,
                date: '2030-11-19',
                time: '20:00',
                venueId: 4,
                durationMinutes: 55,
            }),
        );
    });
    it('returns the displaced booking to the bank if the source had no date', () => {
        const plan = plannerAssign(
            matches,
            rows,
            1,
            slot({ time: '19:15' }),
            true,
        );
        expect(plan.rows[1]).toEqual(
            jasmine.objectContaining({
                id: 2,
                date: '',
                time: '',
                venueId: 0,
                postponed: true,
                roundNumber: 1,
            }),
        );
    });
    it('does not treat the same match as an occupied destination', () => {
        const plan = plannerAssign(matches, rows, 2, slot({ time: '19:15' }));
        expect(plan.occupied).toBeUndefined();
        expect(plan.rows.length).toBe(1);
    });
    it('finds physical occupancy across round/group filters and protects other groups', () => {
        matches[1].groupId = 2;
        expect(
            plannerOccupants(
                matches,
                rows,
                slot({ time: '19:15', roundNumber: 2 }),
            ).map((m) => m.id),
        ).toEqual([2]);
        expect(
            plannerAssign(matches, rows, 1, slot({ time: '19:15' }), true)
                .error,
        ).toContain('другой группы');
    });
    it('protects live, finished and cancelled matches as sources', () => {
        for (const status of ['live', 'finished', 'cancelled']) {
            matches[0].status = status;
            expect(plannerAssign(matches, rows, 1, slot()).rows).toEqual([]);
        }
    });
    it('protects a live booking; cancelled matches do not block slots', () => {
        matches[1].status = 'live';
        expect(
            plannerAssign(matches, rows, 1, slot({ time: '19:15' }), true)
                .error,
        ).toContain('начатым');
        matches[1].status = 'cancelled';
        expect(
            plannerAssign(matches, rows, 1, slot({ time: '19:15' })).rows
                .length,
        ).toBe(1);
    });
    it('rejects ambiguous double bookings before swapping', () => {
        matches[2].matchDatetime = matches[1].matchDatetime;
        rows[3] = { ...rows[2], id: 3 };
        expect(
            plannerAssign(matches, rows, 1, slot({ time: '19:15' }), true)
                .error,
        ).toContain('несколько матчей');
    });
    it('does not renumber knockout rounds in either side of a swap', () => {
        matches[0].canChangeRound = false;
        expect(
            plannerAssign(matches, rows, 1, slot({ roundNumber: 2 })).error,
        ).toContain('плей-офф');
        matches[0].canChangeRound = true;
        rows[1] = {
            ...rows[1],
            date: '2030-11-19',
            time: '18:00',
            venueId: 3,
            postponed: false,
            roundNumber: 2,
        };
        matches[1].canChangeRound = false;
        expect(
            plannerAssign(matches, rows, 1, slot({ time: '19:15' }), true)
                .error,
        ).toContain('Второй матч');
    });
    it('validates calendar dates, time, duration and venue', () => {
        for (const values of [
            { date: '2030-02-30' },
            { time: '24:00' },
            { durationMinutes: 0 },
            { durationMinutes: 481 },
            { durationMinutes: 1.5 },
            { venueId: 0 },
            { venueId: -1 },
            { venueId: 1.5 },
        ]) {
            expect(plannerAssign(matches, rows, 1, slot(values)).rows).toEqual(
                [],
            );
        }
    });
    it('marks overlaps but allows adjacent bookings', () => {
        rows[1] = {
            ...rows[1],
            date: rows[2].date,
            time: '18:00',
            venueId: 3,
            durationMinutes: 75,
            postponed: false,
        };
        expect([...plannerOverlapIds(matches, rows)]).toEqual([]);
        rows[1].durationMinutes = 76;
        expect([...plannerOverlapIds(matches, rows)]).toEqual([1, 2]);
    });
    it('marks team conflicts on different venues and across midnight', () => {
        rows[1] = {
            ...rows[1],
            date: '2030-11-19',
            time: '23:30',
            venueId: 4,
            durationMinutes: 75,
            postponed: false,
        };
        rows[2] = { ...rows[2], date: '2030-11-20', time: '00:15' };
        matches[1].homeTeamId = 11;
        expect([...plannerOverlapIds(matches, rows)]).toEqual([1, 2]);
        rows[1].postponed = true;
        expect([...plannerOverlapIds(matches, rows)]).toEqual([]);
    });
    it('supports legacy scope keys', () => {
        expect(plannerScopeKey({})).toBe('legacy:none');
    });
});
