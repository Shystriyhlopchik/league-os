import { MatchServiceService } from './match-service.service';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';

describe('Roster authority and return workflow', () => {
  const match = {
    id: 1,
    tournamentId: 5,
    status: 'scheduled',
    tournament: { season: { competition: { communityId: 2 } } },
  };
  function setup() {
    const service = Object.create(MatchServiceService.prototype) as any;
    const roster = {
      id: 7,
      isApproved: true,
      isSubmitted: true,
      workflowHistory: [],
      approvedByUserId: 9,
    };
    const manager = {
      findOne: jest.fn(async (entity: unknown) =>
        entity === MatchEntity
          ? match
          : entity === MatchRosterEntity
            ? roster
            : {},
      ),
      find: jest
        .fn()
        .mockResolvedValue([{ teamPlayerId: 11 }, { teamPlayerId: 12 }]),
      save: jest.fn(),
    };
    service.dataSource = {
      manager: { findOneBy: jest.fn() },
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    service.usersService = {
      findById: jest.fn().mockResolvedValue({ roles: [] }),
    };
    service.findRegistrationMatch = jest.fn().mockResolvedValue(match);
    service.getMatchRegistrationByOfficial = jest
      .fn()
      .mockResolvedValue({ ok: true });
    return { service, roster, manager };
  }
  it('permits a referee only with active membership of the match community', async () => {
    const { service } = setup();
    service.usersService.findById.mockResolvedValue({
      roles: [{ code: 'referee' }],
    });
    service.dataSource.manager.findOneBy.mockResolvedValue(null);
    expect(await service.canApproveMatchRoster(match, 9)).toBe(false);
    service.dataSource.manager.findOneBy.mockResolvedValue({
      role: 'member',
      isActive: true,
    });
    expect(await service.canApproveMatchRoster(match, 9)).toBe(true);
    expect(service.dataSource.manager.findOneBy).toHaveBeenCalledWith(
      expect.anything(),
      { communityId: 2, userId: 9, isActive: true },
    );
  });
  it('does not allow a global admin/captain to approve a roster without scoped authority', async () => {
    const { service } = setup();
    service.dataSource.manager.findOneBy.mockResolvedValue({
      role: 'member',
      isActive: true,
    });
    for (const code of ['captain', 'admin']) {
      service.usersService.findById.mockResolvedValue({ roles: [{ code }] });
      expect(await service.canApproveMatchRoster(match, 9)).toBe(false);
    }
    service.dataSource.manager.findOneBy.mockResolvedValue({
      role: 'admin',
      isActive: true,
    });
    expect(await service.canApproveMatchRoster(match, 9)).toBe(true);
  });
  it('returns a submitted/approved roster without deleting players, preserving an audit', async () => {
    const { service, roster, manager } = setup();
    service.canApproveMatchRoster = jest.fn().mockResolvedValue(true);
    await service.returnMatchRegistration(
      1,
      20,
      9,
      ' Исправьте состав команды ',
    );
    expect(roster).toMatchObject({
      isApproved: false,
      isSubmitted: false,
      approvedByUserId: null,
      workflowHistory: [
        {
          action: 'returned',
          actorUserId: 9,
          reason: 'Исправьте состав команды',
          before: [11, 12],
          after: [11, 12],
        },
      ],
    });
    expect(manager.save).toHaveBeenCalledWith(roster);
  });
  it('refuses a return if the game starts between reading and saving', async () => {
    const { service, manager } = setup();
    service.canApproveMatchRoster = jest.fn().mockResolvedValue(true);
    manager.findOne.mockImplementation(async (entity) =>
      entity === MatchEntity ? { ...match, status: 'live' } : {},
    );
    await expect(
      service.returnMatchRegistration(1, 20, 9, 'Исправьте состав'),
    ).rejects.toThrow('уже начат');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('requires an official and a meaningful comment', async () => {
    const { service, manager } = setup();
    service.canApproveMatchRoster = jest.fn().mockResolvedValue(false);
    await expect(
      service.returnMatchRegistration(1, 20, 9, 'Исправьте состав'),
    ).rejects.toThrow('Нет права');
    service.canApproveMatchRoster.mockResolvedValue(true);
    await expect(
      service.returnMatchRegistration(1, 20, 9, ' '),
    ).rejects.toThrow('комментарий');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('does not save a stale roster after the match has started', async () => {
    const { service, manager } = setup();
    service.ensureCanManageRegistrationTeam = jest
      .fn()
      .mockResolvedValue(undefined);
    service.findTeamRoster = jest.fn().mockResolvedValue([]);
    manager.getRepository = jest.fn().mockReturnValue({});
    manager.findOne.mockImplementation(async (entity) =>
      entity === MatchEntity ? { ...match, status: 'live' } : {},
    );
    await expect(service.saveMatchRegistration(1, 20, [], 9)).rejects.toThrow(
      'уже начат',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('does not let a team manager call the official service flow', async () => {
    const { service } = setup();
    service.ensureCanManageRegistrationTeam = jest
      .fn()
      .mockResolvedValue(undefined);
    service.canApproveMatchRoster = jest.fn().mockResolvedValue(false);
    await expect(
      service.saveMatchRegistrationByOfficial(1, 20, [], 9),
    ).rejects.toThrow('от имени судьи');
  });
});
