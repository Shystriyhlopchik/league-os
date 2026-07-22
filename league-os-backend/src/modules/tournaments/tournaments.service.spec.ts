import { TournamentsService } from './tournaments.service';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';

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
      existsBy: jest.fn().mockResolvedValue(Boolean(result)),
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
    const matchEventsRepository = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const matchRosterPlayersRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    return {
      service: new TournamentsService(
        tournamentsRepository as never,
        matchesRepository as never,
        matchEventsRepository as never,
        tournamentTeamsRepository as never,
        matchRosterPlayersRepository as never,
      ),
      queryBuilder,
      matchesRepository,
      tournamentTeamsRepository,
      matchEventsRepository,
      matchRosterPlayersRepository,
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

  it('builds all player leaderboards from finished match events and rosters', async () => {
    const {
      service,
      matchesRepository,
      matchEventsRepository,
      matchRosterPlayersRepository,
    } = createService(tournament);
    const team = { id: 5, name: 'Arman', logoUrl: '/arman.png' };
    const scorer = {
      id: 11,
      firstName: 'Ivan',
      lastName: 'Scorer',
      photoUrl: '/ivan.png',
    };
    const assistant = {
      id: 12,
      firstName: 'Petr',
      lastName: 'Assistant',
      photoUrl: null,
    };
    const defender = {
      id: 13,
      firstName: 'Semen',
      lastName: 'Defender',
      photoUrl: null,
    };

    matchesRepository.find.mockResolvedValue([{ id: 101 }, { id: 102 }]);
    matchEventsRepository.find.mockResolvedValue([
      {
        id: 1,
        matchId: 101,
        eventType: MatchEventType.GOAL,
        goalValue: 1,
        player: scorer,
        assistPlayer: assistant,
        team,
      },
      {
        id: 2,
        matchId: 102,
        eventType: MatchEventType.PENALTY_GOAL,
        goalValue: 1,
        player: scorer,
        team,
      },
      {
        id: 3,
        matchId: 102,
        eventType: MatchEventType.SECOND_YELLOW_CARD,
        goalValue: 1,
        player: assistant,
        team,
      },
      {
        id: 4,
        matchId: 101,
        eventType: MatchEventType.RED_CARD,
        goalValue: 1,
        player: defender,
        team,
      },
      {
        id: 5,
        matchId: 101,
        eventType: MatchEventType.OWN_GOAL,
        goalValue: 1,
        player: defender,
        team,
      },
    ]);
    matchRosterPlayersRepository.find.mockResolvedValue([
      { playerId: scorer.id, matchRoster: { matchId: 101 } },
      { playerId: scorer.id, matchRoster: { matchId: 102 } },
    ]);

    const result = await service.getPlayerLeaders(9, 12);

    expect(matchesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 9, status: 'finished', groupId: 12 },
      }),
    );
    expect(result.leaderboards.goals[0]).toMatchObject({
      value: 2,
      player: { id: scorer.id },
    });
    expect(result.leaderboards.assists[0]).toMatchObject({
      value: 1,
      player: { id: assistant.id },
    });
    expect(result.leaderboards.yellowCards[0].player.id).toBe(assistant.id);
    expect(result.leaderboards.redCards[0].player.id).toBe(defender.id);
    expect(result.leaderboards.goalContributions[0].value).toBe(2);
    expect(result.leaderboards.goalsPerGame[0].value).toBe(1);
  });
});
