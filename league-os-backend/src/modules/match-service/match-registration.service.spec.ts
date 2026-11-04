import { BadRequestException } from '@nestjs/common';

import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { RoleCode } from '../users/enums/role-code.enum';
import { MatchServiceService } from './match-service.service';
import { MatchServiceController } from './match-service.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('MatchServiceService registration editing', () => {
  const buildService = () => {
    const matchRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };
    const matchRosterRepository = {
      findOne: jest.fn(),
    };
    const matchRosterPlayerRepository = {
      find: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(),
    };
    const usersService = {
      findById: jest.fn(),
    };
    const tournamentApplications = {
      matchRoster: jest.fn().mockResolvedValue(null),
      policy: jest
        .fn()
        .mockReturnValue({ minMatchPlayers: 5, maxMatchPlayers: 12 }),
    };

    const service = new MatchServiceService(
      matchRepository as never,
      {} as never,
      {} as never,
      matchRosterRepository as never,
      matchRosterPlayerRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      tournamentApplications as never,
      { myTeams: jest.fn().mockResolvedValue([]) } as never,
    );

    return {
      service,
      matchRepository,
      matchRosterRepository,
      matchRosterPlayerRepository,
      dataSource,
      usersService,
      tournamentApplications,
    };
  };

  const match = {
    id: 10,
    homeTeamId: 20,
    awayTeamId: 30,
    homeTeam: { id: 20, name: 'Home' },
    awayTeam: { id: 30, name: 'Away' },
  };

  const prepareApprovedRoster = () => {
    const fixture = buildService();
    const currentPlayers = Array.from({ length: 6 }, (_, index) => ({
      id: 50 + index,
      teamPlayerId: 60 + index,
      shirtNumber: index + 1,
      position: 'forward',
      isCaptain: index === 0,
      eligibilityStatus: 'allowed',
      eligibilityReason: 'none',
    }));
    jest
      .spyOn(fixture.service as never, 'findRegistrationMatch' as never)
      .mockResolvedValue({
        ...match,
        tournamentId: 1,
        tournament: { registrationRequired: true },
      } as never);
    jest
      .spyOn(
        fixture.service as never,
        'ensureCanManageRegistrationTeam' as never,
      )
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(fixture.service as never, 'findTeamRoster' as never)
      .mockResolvedValue(currentPlayers as never);
    jest
      .spyOn(fixture.service as never, 'findSubmittedTeamRoster' as never)
      .mockResolvedValue(currentPlayers.slice(0, 5) as never);
    fixture.matchRosterRepository.findOne.mockResolvedValue({
      id: 1,
      isSubmitted: true,
      isApproved: true,
    });
    fixture.matchRosterPlayerRepository.find.mockResolvedValue(
      currentPlayers
        .slice(0, 5)
        .map((p) => ({ playerId: p.id, teamPlayerId: p.teamPlayerId })),
    );
    return { ...fixture, currentPlayers };
  };

  it('shows newly approved tournament players to the official without auto-selecting them', async () => {
    const { service } = prepareApprovedRoster();
    const result = await service.getMatchRegistrationByOfficial(10, 20, 40);
    expect(result.players).toHaveLength(6);
    expect(result.players.filter((p) => p.isSelected)).toHaveLength(5);
    expect(result.players.find((p) => p.teamPlayerId === 65)).toMatchObject({
      isSelected: false,
    });
    expect(result.isApproved).toBe(true);
  });

  it('keeps the approved snapshot for the captain', async () => {
    const { service } = prepareApprovedRoster();
    const result = await service.getMatchRegistration(10, 20, 40);
    expect(result.players).toHaveLength(5);
    expect(result.players.some((p) => p.teamPlayerId === 65)).toBe(false);
  });

  it('preserves saved selections and prefers current metadata for players still admitted', async () => {
    const { service, currentPlayers } = prepareApprovedRoster();
    const historicalPlayer = { ...currentPlayers[0], id: 99, teamPlayerId: 99 };
    (service as any).findSubmittedTeamRoster.mockResolvedValue([
      { ...currentPlayers[0], shirtNumber: 99 },
      historicalPlayer,
    ]);
    (service as any).matchRosterPlayerRepository.find.mockResolvedValue([
      { teamPlayerId: 60 },
      { teamPlayerId: 99 },
    ]);
    const result = await service.getMatchRegistrationByOfficial(10, 20, 40);
    expect(result.players.filter((p) => p.teamPlayerId === 60)).toHaveLength(1);
    expect(result.players.find((p) => p.teamPlayerId === 60)).toMatchObject({
      shirtNumber: 1,
      isSelected: true,
    });
    expect(result.players.find((p) => p.teamPlayerId === 99)).toMatchObject({
      isSelected: true,
    });
  });

  it('saves a newly admitted player through the official flow and keeps the roster approved', async () => {
    const { service, currentPlayers, dataSource } = prepareApprovedRoster();
    const savedRoster = { id: 1, isSubmitted: true, isApproved: true };
    const rosterRepository = {
      findOne: jest.fn().mockResolvedValue(savedRoster),
      save: jest.fn(),
    };
    const rosterPlayerRepository = {
      delete: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => value),
    };
    dataSource.transaction.mockImplementation(async (callback) =>
      callback({
        findOne: jest.fn().mockResolvedValue({ id: 1 }),
        find: jest.fn().mockResolvedValue(currentPlayers),
        getRepository: (entity: unknown) =>
          entity === MatchRosterEntity
            ? rosterRepository
            : rosterPlayerRepository,
      }),
    );
    jest
      .spyOn(service, 'getMatchRegistrationByOfficial')
      .mockResolvedValue({ ok: true } as never);
    await expect(
      service.saveMatchRegistrationByOfficial(
        10,
        20,
        currentPlayers.map((p) => p.teamPlayerId),
        40,
      ),
    ).resolves.toEqual({ ok: true });
    expect(rosterPlayerRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          matchRosterId: 1,
          playerId: 55,
          teamPlayerId: 65,
        }),
      ]),
    );
    expect(rosterRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isApproved: true, approvedByUserId: 40 }),
    );
  });

  it('rejects players outside the current approved tournament roster', async () => {
    const { service, dataSource } = prepareApprovedRoster();
    await expect(
      service.saveMatchRegistrationByOfficial(
        10,
        20,
        [60, 61, 62, 63, 999],
        40,
      ),
    ).rejects.toThrow('В заявке есть игрок, который не состоит в команде');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('keeps the disciplinary restriction for an official adding a new player', async () => {
    const { service, currentPlayers, dataSource } = prepareApprovedRoster();
    currentPlayers[5].eligibilityStatus = 'not_allowed';
    await expect(
      service.saveMatchRegistrationByOfficial(
        10,
        20,
        currentPlayers.map((p) => p.teamPlayerId),
        40,
      ),
    ).rejects.toThrow('дисквалифицирован на этот матч');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('does not open signed/finished matches in the ordinary manual-entry flow', async () => {
    const { service, matchRepository } = buildService();
    matchRepository.findOne.mockResolvedValue(null);
    await expect(
      service.getMatchRegistrationByOfficial(10, 20, 40),
    ).rejects.toThrow('Предстоящий матч не найден');
    await expect(
      service.saveMatchRegistrationByOfficial(10, 20, [60, 61, 62, 63, 64], 40),
    ).rejects.toThrow('Предстоящий матч не найден');
    expect(matchRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, status: MatchStatus.SCHEDULED },
      }),
    );
  });

  it('protects the official candidate endpoint with authentication and official roles', () => {
    const handler =
      MatchServiceController.prototype.getMatchRegistrationByOfficial;
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      RoleCode.Referee,
      RoleCode.Admin,
      RoleCode.SuperAdmin,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
  });

  it('keeps scheduled matches available after their kickoff time', async () => {
    const { service, matchRepository, usersService } = buildService();
    const query = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          ...match,
          tournamentId: 1,
          matchDatetime: new Date('2020-01-01T12:00:00Z'),
          status: MatchStatus.SCHEDULED,
          homeScore: 0,
          awayScore: 0,
          homeTeam: { ...match.homeTeam, shortName: 'H' },
          awayTeam: { ...match.awayTeam, shortName: 'A' },
        },
      ]),
    };
    matchRepository.createQueryBuilder.mockReturnValue(query);
    usersService.findById.mockResolvedValue({
      roles: [{ code: RoleCode.Admin }],
    });

    await expect(service.findRegistrationMatches(40)).resolves.toHaveLength(1);
    expect(query.where).toHaveBeenCalledWith('match.status = :status', {
      status: MatchStatus.SCHEDULED,
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      '(tournament.lifecycle_status IS NULL OR tournament.lifecycle_status <> :draft)',
      { draft: 'draft' },
    );
    expect(query.andWhere).not.toHaveBeenCalledWith(
      expect.stringMatching(/match_datetime/),
      expect.anything(),
    );
  });

  it('returns submission and referee approval as separate states', async () => {
    const { service, matchRosterRepository, matchRosterPlayerRepository } =
      buildService();

    jest
      .spyOn(service as never, 'findRegistrationMatch' as never)
      .mockResolvedValue(match as never);
    jest
      .spyOn(service as never, 'ensureCanManageRegistrationTeam' as never)
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(service as never, 'findTeamRoster' as never)
      .mockResolvedValue([] as never);
    matchRosterRepository.findOne.mockResolvedValue({
      id: 1,
      isSubmitted: true,
      isApproved: false,
    });
    matchRosterPlayerRepository.find.mockResolvedValue([]);

    await expect(service.getMatchRegistration(10, 20, 40)).resolves.toEqual(
      expect.objectContaining({
        isSubmitted: true,
        isApproved: false,
      }),
    );
  });

  it('allows a captain to change a submitted roster before referee approval', async () => {
    const { service, dataSource } = buildService();
    const rosterRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        isSubmitted: true,
        isApproved: false,
      }),
      save: jest.fn(),
    };
    const rosterPlayerRepository = {
      delete: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => value),
    };

    jest
      .spyOn(service as never, 'findRegistrationMatch' as never)
      .mockResolvedValue(match as never);
    jest
      .spyOn(service as never, 'ensureCanManageRegistrationTeam' as never)
      .mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'findTeamRoster' as never).mockResolvedValue([
      {
        id: 50,
        teamPlayerId: 60,
        shirtNumber: 7,
        position: 'forward',
        isCaptain: true,
        eligibilityStatus: 'allowed',
      },
    ] as never);
    jest
      .spyOn(service, 'getMatchRegistration')
      .mockResolvedValue({ ok: true } as never);
    dataSource.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: (entity: unknown) =>
          entity === MatchRosterEntity
            ? rosterRepository
            : rosterPlayerRepository,
      }),
    );

    await expect(
      service.saveMatchRegistration(10, 20, [60], 40),
    ).resolves.toEqual({ ok: true });
    expect(rosterPlayerRepository.delete).toHaveBeenCalledWith({
      matchRosterId: 1,
    });
    expect(rosterPlayerRepository.save).toHaveBeenCalled();
  });

  it('rejects captain changes after referee approval', async () => {
    const { service, dataSource } = buildService();
    const rosterRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        isSubmitted: true,
        isApproved: true,
      }),
    };

    jest
      .spyOn(service as never, 'findRegistrationMatch' as never)
      .mockResolvedValue(match as never);
    jest
      .spyOn(service as never, 'ensureCanManageRegistrationTeam' as never)
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(service as never, 'findTeamRoster' as never)
      .mockResolvedValue([] as never);
    dataSource.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: (entity: unknown) =>
          entity === MatchRosterEntity
            ? rosterRepository
            : {
                delete: jest.fn(),
                save: jest.fn(),
                create: jest.fn(),
              },
      }),
    );

    await expect(service.saveMatchRegistration(10, 20, [], 40)).rejects.toEqual(
      new BadRequestException(
        'Подтверждённую судьёй заявку нельзя редактировать',
      ),
    );
  });
});
