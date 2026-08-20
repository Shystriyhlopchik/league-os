import { BadRequestException } from '@nestjs/common';

import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { RoleCode } from '../users/enums/role-code.enum';
import { MatchServiceService } from './match-service.service';

describe('MatchServiceService registration editing', () => {
  const buildService = () => {
    const matchRepository = {
      createQueryBuilder: jest.fn(),
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
    );

    return {
      service,
      matchRepository,
      matchRosterRepository,
      matchRosterPlayerRepository,
      dataSource,
      usersService,
    };
  };

  const match = {
    id: 10,
    homeTeamId: 20,
    awayTeamId: 30,
    homeTeam: { id: 20, name: 'Home' },
    awayTeam: { id: 30, name: 'Away' },
  };

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
    expect(query.andWhere).not.toHaveBeenCalled();
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
