import { calendarConflicts, canMoveCalendarRound } from './calendar-batch';
import { MatchEntity } from '../../matches/entities/match.entity';
import { MatchRoundType } from '../../matches/enums/match-round-type.enum';
import { MatchStatus } from '../../matches/enums/match-status.enum';
import { TournamentStageType } from '../../tournament-stages/enums/tournament-stage-type.enum';

describe('Batch calendar final-state validation', () => {
  const match = (
    id: number,
    time = '18:00',
    extra: Partial<MatchEntity> = {},
  ) =>
    Object.assign(new MatchEntity(), {
      id,
      tournamentId: 1,
      stageId: 1,
      groupId: 1,
      roundType: MatchRoundType.GROUP_ROUND,
      roundNumber: id,
      status: MatchStatus.SCHEDULED,
      homeTeamId: id * 2,
      awayTeamId: id * 2 + 1,
      venueId: 1,
      matchDatetime: new Date(`2030-01-01T${time}:00`),
      durationMinutes: 75,
      ...extra,
    });
  const conflicts = (
    rows: MatchEntity[],
    external: MatchEntity[] = [],
    changed = [1, 2],
    moved: number[] = [],
  ) => calendarConflicts(rows, external, new Set(changed), new Set(moved));
  it('accepts swapped occupied slots and back-to-back intervals', () => {
    expect(conflicts([match(1, '19:15'), match(2, '18:00')])).toEqual([]);
  });
  it('checks intersections in the final draft', () => {
    expect(conflicts([match(1, '18:00'), match(2, '18:30')])[0]).toMatchObject({
      field: 'matchDatetime',
      matchId: 1,
      otherMatchId: 2,
    });
  });
  it('rejects external tournament bookings', () => {
    expect(
      conflicts([match(1)], [match(3, '18:00', { tournamentId: 2 })])[0]
        .message,
    ).toContain('площадка занята');
  });
  it('checks team bookings even at a different venue', () => {
    expect(
      conflicts(
        [match(1)],
        [match(3, '18:00', { tournamentId: 2, venueId: 2, homeTeamId: 2 })],
      )[0].message,
    ).toContain('команда занята');
  });
  it('does not count a postponed booking', () => {
    expect(
      conflicts([match(1), match(2, '18:00', { postponedAt: new Date() })]),
    ).toEqual([]);
  });
  it('does not block safe corrections due to unrelated old collisions', () => {
    expect(conflicts([match(1, '22:00'), match(2), match(3)], [], [1])).toEqual(
      [],
    );
  });
  it('detects two fixtures of the same team in a destination round', () => {
    expect(
      conflicts(
        [
          match(1, '18:00', { roundNumber: 2 }),
          match(2, '20:00', { homeTeamId: 2 }),
        ],
        [],
        [1],
        [1],
      )[0].field,
    ).toBe('roundNumber');
  });
  it('allows a coherent round exchange', () => {
    expect(
      conflicts(
        [
          match(1, '18:00', { roundNumber: 2 }),
          match(2, '20:00', { roundNumber: 1, homeTeamId: 2 }),
        ],
        [],
        [1, 2],
        [1, 2],
      ),
    ).toEqual([]);
  });
  it('allows legacy rounds but not knockout numbering', () => {
    expect(canMoveCalendarRound(match(1), [], 'mixed')).toBe(true);
    expect(
      canMoveCalendarRound(match(1, '18:00', { bracketSnapshotId: 1 }), []),
    ).toBe(false);
    expect(
      canMoveCalendarRound(match(1), [
        { id: 1, type: TournamentStageType.KNOCKOUT } as any,
      ]),
    ).toBe(false);
    expect(
      canMoveCalendarRound(
        match(1, '18:00', { roundType: MatchRoundType.FINAL }),
        [],
      ),
    ).toBe(false);
  });
  it('requires the second leg to follow the occupied first-leg slot', () => {
    const a = match(1, '18:00', {
      bracketSnapshotId: 1,
      bracketPosition: 'QF-1:L1',
    });
    const b = match(2, '18:30', {
      bracketSnapshotId: 1,
      bracketPosition: 'QF-1:L2',
      venueId: 2,
    });
    expect(conflicts([a, b])[0].message).toContain('после завершения');
  });
  it('requires a postponed upstream fixture to be scheduled before downstream', () => {
    const a = match(1, '18:00', {
      bracketSnapshotId: 1,
      bracketPosition: 'QF-1:L1',
      postponedAt: new Date(),
    });
    const b = match(2, '20:00', {
      bracketSnapshotId: 1,
      bracketPosition: 'QF-1:L2',
    });
    expect(conflicts([a, b])[0].field).toBe('matchDatetime');
  });
});
