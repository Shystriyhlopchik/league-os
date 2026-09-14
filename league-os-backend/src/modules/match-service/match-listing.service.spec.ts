import { MatchStatus } from '../matches/enums/match-status.enum';
import { MatchServiceService } from './match-service.service';

describe('MatchServiceService match listings', () => {
  const buildService = () => {
    const matchRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const service = new MatchServiceService(
      matchRepository as never,
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
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, matchRepository };
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
});
