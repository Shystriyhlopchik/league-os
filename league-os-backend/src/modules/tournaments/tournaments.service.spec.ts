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
    };

    return {
      service: new TournamentsService(
        tournamentsRepository as never,
        {} as never,
        {} as never,
      ),
      queryBuilder,
    };
  }

  it('returns the public projection of the highest-priority active tournament', async () => {
    const { service, queryBuilder } = createService(tournament);

    await expect(service.findActive()).resolves.toEqual(
      expect.objectContaining({
        id: 9,
        name: 'Active tournament',
        season: expect.objectContaining({ id: 6 }),
        competition: expect.objectContaining({ id: 3 }),
      }),
    );
    expect(queryBuilder.orderBy).toHaveBeenCalled();
    expect(queryBuilder.getOne).toHaveBeenCalled();
  });

  it('returns null when there is no public active tournament', async () => {
    const { service } = createService(null);

    await expect(service.findActive()).resolves.toBeNull();
  });
});
