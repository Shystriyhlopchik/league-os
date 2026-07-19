import { TournamentsService } from './tournaments.service';

describe('TournamentsService active tournament', () => {
  const competition = {
    id: 3,
    name: 'Competition',
    slug: 'competition',
    logoUrl: null,
    colorPrimary: '#174EA6',
  };
  const season = {
    id: 6,
    name: 'Season 2026',
    year: 2026,
    competition,
  };
  const tournament = {
    id: 9,
    name: 'Active tournament',
    slug: 'active-tournament',
    description: 'Description',
    type: 'league',
    format: 'mixed',
    status: 'active',
    startDate: '2026-07-01',
    endDate: '2026-08-01',
    logoUrl: null,
    colorPrimary: '#174EA6',
    season,
  };

  function createService(result: typeof tournament | null) {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
    };
    const tournamentsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest.fn().mockResolvedValue(
        result
          ? {
              ...result,
              seasonId: result.season.id,
              season: {
                ...result.season,
                competitionId: result.season.competition.id,
              },
            }
          : null,
      ),
    };
    const matchesRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const tournamentTeamsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    return {
      service: new TournamentsService(
        tournamentsRepository as never,
        matchesRepository as never,
        {} as never,
        tournamentTeamsRepository as never,
      ),
      queryBuilder,
      matchesRepository,
      tournamentTeamsRepository,
    };
  }

  it('returns the public projection of the highest-priority active tournament', async () => {
    const { service, queryBuilder } = createService(tournament);

    const result = await service.findActive();
    expect(result).toMatchObject({ id: 9, name: 'Active tournament' });
    expect(result?.season).toMatchObject({ id: 6 });
    expect(result?.competition).toMatchObject({ id: 3 });
    expect(queryBuilder.orderBy).toHaveBeenCalled();
    expect(queryBuilder.getOne).toHaveBeenCalled();
  });

  it('returns null when there is no public active tournament', async () => {
    const { service } = createService(null);

    await expect(service.findActive()).resolves.toBeNull();
  });

  it('filters the statistics summary by group without changing the endpoint contract', async () => {
    const { service, matchesRepository } = createService(tournament);

    await expect(service.getStatsSummary(9, 12)).resolves.toEqual(
      expect.objectContaining({
        tournamentId: 9,
        groupId: 12,
        played: 0,
      }),
    );
    expect(matchesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 9, groupId: 12 },
      }),
    );
  });

  it('returns only the public projection of active tournament teams', async () => {
    const { service, tournamentTeamsRepository } = createService(tournament);
    tournamentTeamsRepository.find.mockResolvedValue([
      {
        id: 101,
        team: {
          id: 15,
          name: 'Арман',
          shortName: 'Арман',
          slug: 'arman',
          logoUrl: '/uploads/teams/arman.png',
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
          city: 'Чебоксары',
          village: null,
          isActive: true,
          description: 'must not be exposed',
        },
      },
    ]);

    await expect(service.findPublicTeams(9)).resolves.toEqual([
      {
        id: 15,
        name: 'Арман',
        shortName: 'Арман',
        slug: 'arman',
        logoUrl: '/uploads/teams/arman.png',
        primaryColor: '#000000',
        secondaryColor: '#FFFFFF',
        city: 'Чебоксары',
        village: null,
        isActive: true,
      },
    ]);
    expect(tournamentTeamsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tournamentId: 9 }),
      }),
    );
  });
});
