import { MatchesService } from '../matches/matches.service';
import { MatchServiceService } from '../match-service/match-service.service';

describe('Player corrections and historical protocol rendering', () => {
  const identity = {
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: null,
    birthDate: '2000-01-01',
  };
  const currentPlayer = {
    id: 5,
    firstName: 'Пётр',
    lastName: 'Исправленный',
    photoUrl: '/new.jpg',
  };
  const rosterPlayer = {
    id: 7,
    playerId: 5,
    matchRosterId: 4,
    teamPlayerId: 6,
    shirtNumber: 9,
    isCaptain: false,
    identitySnapshot: identity,
    player: currentPlayer,
  };
  it('renders archived roster and scorer names from the snapshot, but keeps current photos', async () => {
    const team = { id: 1, name: 'Команда' };
    const match = {
      id: 1,
      status: 'finished',
      homeTeamId: 1,
      awayTeamId: 2,
      homeTeam: team,
      awayTeam: { ...team, id: 2 },
      tournament: { id: 1, season: { id: 1, competition: { id: 1 } } },
      officials: [],
      events: [
        {
          id: 1,
          player: currentPlayer,
          assistPlayer: currentPlayer,
          secondaryPlayer: currentPlayer,
          isCancelled: false,
        },
      ],
    };
    const matches = { findOne: jest.fn().mockResolvedValue(match) };
    const rosters = {
      find: jest.fn().mockResolvedValue([{ id: 4, teamId: 1 }]),
    };
    const players = { find: jest.fn().mockResolvedValue([rosterPlayer]) };
    const service = new MatchesService(
      matches as never,
      rosters as never,
      players as never,
    );
    const result = await service.findProtocol(1);
    expect(result.rosters.home[0]).toMatchObject({
      id: 5,
      firstName: 'Иван',
      lastName: 'Иванов',
      photoUrl: '/new.jpg',
    });
    expect(result.events[0].player).toMatchObject({
      id: 5,
      firstName: 'Иван',
      lastName: 'Иванов',
    });
    expect(result.events[0].assistPlayer?.firstName).toBe('Иван');
    expect(result.events[0].secondaryPlayer?.firstName).toBe('Иван');
  });
  it('uses the same frozen identities in the official match-service event list', async () => {
    const service = Object.create(MatchServiceService.prototype);
    service.matchRosterPlayerRepository = {
      find: jest.fn().mockResolvedValue([rosterPlayer]),
    };
    service.matchEventRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            player: currentPlayer,
            assistPlayer: currentPlayer,
            secondaryPlayer: currentPlayer,
          },
        ]),
    };
    const events = await service.getMatchEvents(1);
    expect(events[0].player).toMatchObject({
      id: 5,
      firstName: 'Иван',
      lastName: 'Иванов',
    });
    expect(events[0].assistPlayer.firstName).toBe('Иван');
  });
  it('uses current names for matches that have no archived identity', async () => {
    const service = Object.create(MatchServiceService.prototype);
    service.matchRosterPlayerRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    service.matchEventRepository = {
      find: jest.fn().mockResolvedValue([{ id: 1, player: currentPlayer }]),
    };
    const events = await service.getMatchEvents(1);
    expect(events[0].player.firstName).toBe('Пётр');
  });
});
