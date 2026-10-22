import { applicationEditWindow } from './application-edit-window';
import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import { MatchStatus } from '../matches/enums/match-status.enum';

describe('Application editing cutoff', () => {
  const match = (
    roundNumber = 4,
    status = MatchStatus.SCHEDULED,
    date: Date | undefined = new Date(2026, 10, 1, 18),
  ) => ({
    roundNumber,
    roundType: MatchRoundType.GROUP_ROUND,
    status,
    matchDatetime: date,
  });
  const kickoff = new Date('2026-11-01T18:00:00+03:00');
  it('allows editing before kickoff and locks exactly at the first fourth-round kickoff in Moscow time', () => {
    const before = applicationEditWindow(
      [match()],
      new Date(kickoff.getTime() - 1),
    );
    expect(before.locked).toBe(false);
    expect(before.locksAt).toBe('2026-11-01T15:00:00.000Z');
    expect(applicationEditWindow([match()], kickoff).locked).toBe(true);
  });
  it('uses one earliest cutoff across all groups, not the selected team next game', () => {
    const nextGroup = match(
      4,
      MatchStatus.SCHEDULED,
      new Date(2026, 10, 8, 18),
    );
    expect(applicationEditWindow([nextGroup, match()], kickoff)).toMatchObject({
      locked: true,
      locksAt: kickoff.toISOString(),
    });
  });
  it('ignores earlier rounds, knockout matches and cancelled fixtures', () => {
    expect(
      applicationEditWindow(
        [
          match(3, MatchStatus.FINISHED),
          {
            ...match(4, MatchStatus.FINISHED),
            roundType: MatchRoundType.QUARTER_FINAL,
          },
          match(4, MatchStatus.CANCELLED),
        ],
        kickoff,
      ),
    ).toMatchObject({ locked: false, locksAt: null });
  });
  it('also locks if a later round starts when fourth-round fixtures are postponed or cancelled', () => {
    expect(
      applicationEditWindow(
        [match(4, MatchStatus.CANCELLED), match(5, MatchStatus.LIVE)],
        new Date('2026-10-01'),
      ).locked,
    ).toBe(true);
  });
  it('honors actually live or finished rounds even without a date or with a future date', () => {
    for (const status of [MatchStatus.LIVE, MatchStatus.FINISHED]) {
      expect(
        applicationEditWindow(
          [{ ...match(4, status), matchDatetime: undefined }],
          new Date('2026-10-01'),
        ).locked,
      ).toBe(true);
      expect(
        applicationEditWindow([match(4, status)], new Date('2026-10-01'))
          .locked,
      ).toBe(true);
    }
  });
  it('does not invent a cutoff before fixtures have been scheduled', () => {
    expect(
      applicationEditWindow(
        [{ ...match(), matchDatetime: undefined }],
        kickoff,
      ),
    ).toMatchObject({ locked: false, locksAt: null });
    expect(applicationEditWindow([], kickoff).locked).toBe(false);
  });
  it('applies the same rule to a league without groups', () => {
    expect(
      applicationEditWindow(
        [{ ...match(), roundType: MatchRoundType.ROUND_ROBIN }],
        kickoff,
      ).locked,
    ).toBe(true);
  });
});
