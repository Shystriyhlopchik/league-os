import { MatchEntity } from '../../matches/entities/match.entity';
import { MatchStatus } from '../../matches/enums/match-status.enum';
import { TournamentRuleVersionEntity } from '../../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentEntity } from '../entities/tournaments.entity';
import { TournamentLifecycleService } from '../tournament-lifecycle.service';

describe('Calendar slot rule selection and saving', () => {
  const config = (minutes: number) => ({ stages: [
    { stageKey: 'groups', match: { periods: 2, periodDurationMinutes: minutes } },
    { stageKey: 'playoffs', match: { periods: 2, periodDurationMinutes: 30 } },
  ] });
  let service: TournamentLifecycleService;
  let match: any;
  let tournament: any;
  let versions: any[];
  let stages: any[];
  let manager: any;
  let booking: any;

  beforeEach(() => {
    tournament = { id: 1, activeRuleVersionId: 10, status: 'active', lifecycleStatus: 'in_progress' };
    match = { id: 7, tournamentId: 1, stageId: 2, status: MatchStatus.SCHEDULED,
      durationMinutes: 60, scheduleRevision: 0, homeTeamId: 4, awayTeamId: 5 };
    // A newer, unpublished draft must not override published scheduling rules.
    versions = [{ id: 11, config: config(45) }, { id: 10, config: config(20) }];
    stages = [{ id: 2, key: 'groups' }, { id: 3, key: 'playoffs' }];
    booking = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null) };
    manager = {
      findOne: jest.fn(async (entity, options) => {
        if (entity === TournamentEntity) return tournament;
        if (entity === MatchEntity) return match;
        if (entity === TournamentStageEntity) return stages.find((s) => s.id === options.where.id);
        if (entity === TournamentRuleVersionEntity)
          return options.where.id ? versions.find((v) => v.id === options.where.id) : versions[0];
        return null;
      }),
      find: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value) => value),
      getRepository: jest.fn(() => ({ createQueryBuilder: () => booking })),
    };
    service = Object.assign(Object.create(TournamentLifecycleService.prototype), {
      tournamentRepository: { findOne: async () => tournament },
      stageRepository: { find: async () => stages },
      matchRepository: { find: async () => [match] },
      ruleVersionRepository: { find: async () => versions },
      dataSource: { getRepository: () => ({ find: async () => [] }),
        transaction: async (fn: any) => fn(manager) },
    });
  });

  it('uses active rules rather than a newer draft', async () => {
    expect((await service.calendar(1)).matches[0].defaultDurationMinutes).toBe(55);
  });
  it('uses the correct stage and match-pinned rule version', async () => {
    match.stageId = 3;
    expect((await service.calendar(1)).matches[0].defaultDurationMinutes).toBe(75);
    match.stageId = 2;
    match.effectiveRuleVersionId = 11;
    expect((await service.calendar(1)).matches[0].defaultDurationMinutes).toBe(105);
  });
  it('uses the latest version before publication, but does not invent missing rules', async () => {
    tournament.activeRuleVersionId = null;
    expect((await service.calendar(1)).matches[0].defaultDurationMinutes).toBe(105);
    versions = [];
    expect((await service.calendar(1)).matches[0].defaultDurationMinutes).toBeNull();
  });
  const change = (durationMinutes?: number) => ({ matchDatetime: '2026-11-20T12:00',
    venueId: 9, expectedRevision: 0, reason: 'Новое время', durationMinutes });
  it('calculates a missing slot on the server and uses it for collision checking', async () => {
    await service.updateCalendarMatch(1, 7, change(), 12);
    expect(match.durationMinutes).toBe(55);
    const interval = booking.andWhere.mock.calls.find((call: any[]) => call[1]?.end);
    expect(interval[1].end).toBe('2026-11-20T12:55:00');
  });
  it('preserves an explicit custom slot', async () => {
    await service.updateCalendarMatch(1, 7, change(80), 12);
    expect(match.durationMinutes).toBe(80);
  });
  it('keeps a previously booked slot when omitted in a later edit', async () => {
    match.durationMinutes = 70;
    match.scheduleRevision = 2;
    await service.updateCalendarMatch(1, 7, { ...change(), expectedRevision: 2 }, 12);
    expect(match.durationMinutes).toBe(70);
  });
});
