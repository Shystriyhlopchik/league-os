import { MatchStatus } from '../matches/enums/match-status.enum';
import { MatchServiceService } from './match-service.service';

describe('MatchServiceService match listings', () => {
  const buildService = () => {
    const matchRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const matchRosterRepository = {
      find: jest.fn(),
    };
    const dataSource = {
      manager: {},
    };

    const service = new MatchServiceService(
      matchRepository as never,
      {} as never,
      {} as never,
      matchRosterRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      { matchRoster: jest.fn().mockResolvedValue(null) } as never,
      { myTeams: jest.fn().mockResolvedValue([]) } as never,
    );

    return { service, matchRepository, matchRosterRepository };
  };

  const resolvedMatch = {
    id: 10,
    tournamentId: 1,
    round: 'Полуфинал 1',
    matchDatetime: new Date('2026-09-10T18:00:00Z'),
    status: MatchStatus.SCHEDULED,
    homeScore: 0,
    awayScore: 0,
    homeTeamId: 4,
    awayTeamId: 9,
    homeTeam: { id: 4, name: 'Команда 4' },
    awayTeam: { id: 9, name: 'Команда 9' },
  };

  const expectResolvedParticipantsFilter = (options: unknown) => {
    expect(options).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          homeTeamId: expect.objectContaining({ _type: 'not' }),
          awayTeamId: expect.objectContaining({ _type: 'not' }),
        }),
      }),
    );
  };

  it('returns overdue playoff matches only after both participants are resolved', async () => {
    const { service, matchRepository } = buildService();
    matchRepository.find.mockResolvedValue([resolvedMatch]);

    await expect(service.findOverdueMatches()).resolves.toEqual([
      expect.objectContaining({
        id: 10,
        homeTeam: expect.objectContaining({ id: 4 }),
        awayTeam: expect.objectContaining({ id: 9 }),
      }),
    ]);

    expectResolvedParticipantsFilter(matchRepository.find.mock.calls[0][0]);
  });

  it('excludes unresolved bracket matches from the referee match list', async () => {
    const { service, matchRepository } = buildService();
    matchRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([resolvedMatch]);
    matchRepository.findOne.mockResolvedValue(resolvedMatch);

    await expect(service.findAvailableMatches()).resolves.toHaveLength(1);

    const listingOptions = [
      matchRepository.find.mock.calls[0][0],
      matchRepository.findOne.mock.calls[0][0],
      matchRepository.find.mock.calls[1][0],
    ];
    listingOptions.forEach(expectResolvedParticipantsFilter);
  });

  it('exposes penalty shootout rules and the saved shootout separately from the match score', async () => {
    const { service, matchRepository, matchRosterRepository } = buildService();
    matchRepository.findOne.mockResolvedValue({
      ...resolvedMatch,
      status: MatchStatus.FINISHED,
      homeScore: 1,
      awayScore: 1,
      penaltyHomeScore: 5,
      penaltyAwayScore: 4,
      penaltyHomeKicksTaken: 5,
      penaltyAwayKicksTaken: 5,
    });
    matchRosterRepository.find.mockResolvedValue([]);
    jest
      .spyOn(service as never, 'findTeamRoster' as never)
      .mockResolvedValue([] as never);
    jest
      .spyOn(service as never, 'getEffectiveMatchRules' as never)
      .mockResolvedValue({
        periods: 2,
        periodDurationMinutes: 20,
        allowDraw: false,
        extraTime: { enabled: false },
        penalties: {
          enabled: true,
          initialKicksPerTeam: 5,
          suddenDeath: true,
        },
      } as never);

    await expect(service.getRosterCheck(10)).resolves.toEqual(
      expect.objectContaining({
        match: expect.objectContaining({
          homeScore: 1,
          awayScore: 1,
          extraTimeEnabled: false,
          penaltyShootout: {
            initialKicksPerTeam: 5,
            suddenDeath: true,
          },
          penalties: {
            home: 5,
            away: 4,
            homeKicksTaken: 5,
            awayKicksTaken: 5,
          },
        }),
      }),
    );
  });
});
