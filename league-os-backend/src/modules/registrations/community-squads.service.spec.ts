import { ConflictException } from '@nestjs/common';
import { CommunitySquadsService } from './community-squads.service';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { CommunityTransferRequestEntity } from './entities/registration.entity';

describe('Community squad shirt-number conflicts', () => {
  const actor = { id: 1, roles: ['super_admin'] };
  let service: CommunitySquadsService;
  let manager: {
    countBy: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    update: jest.Mock;
    save: jest.Mock;
  };
  let requests: { find: jest.Mock };
  let players: { find: jest.Mock };
  let access: jest.Mock;
  let getRepository: jest.Mock;
  const occupant = {
    id: 10,
    communityId: 1,
    teamId: 20,
    shirtNumber: 7,
    playerId: 30,
    player: { lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' },
  };
  const request = {
    id: 100,
    communityId: 1,
    playerId: 40,
    fromTeamId: 19,
    toTeamId: 20,
    shirtNumber: 7,
    status: 'pending',
  };

  beforeEach(() => {
    manager = {
      countBy: jest.fn().mockResolvedValue(8),
      findOne: jest.fn().mockResolvedValue(null),
      findOneBy: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
    };
    requests = { find: jest.fn().mockResolvedValue([request]) };
    players = { find: jest.fn().mockResolvedValue([occupant]) };
    access = jest.fn().mockResolvedValue({});
    getRepository = jest.fn((entity) =>
      entity === CommunityTransferRequestEntity ? requests : players,
    );
    const db = {
      getRepository,
      transaction: async (action: (m: unknown) => unknown) => action(manager),
    };
    service = new CommunitySquadsService(
      db as never,
      { assertAccess: access } as never,
    );
  });

  it('names the number holder and scopes the lookup to the active destination squad', async () => {
    manager.findOne.mockResolvedValue(occupant);
    await expect(
      service.assertSlot(manager as never, 1, 20, 7),
    ).rejects.toThrow('Номер 7 уже занят: Иванов Иван Иванович');
    expect(manager.findOne).toHaveBeenCalledWith(TeamPlayerEntity, {
      where: { communityId: 1, teamId: 20, shirtNumber: 7, isActive: true },
      relations: { player: true },
    });
  });

  it('supports names without a patronymic', async () => {
    manager.findOne.mockResolvedValue({
      ...occupant,
      player: { lastName: 'Петров', firstName: 'Пётр' },
    });
    await expect(
      service.assertSlot(manager as never, 1, 20, 7),
    ).rejects.toThrow('Номер 7 уже занят: Петров Пётр.');
  });

  it('allows a free number and keeps the twelve-player limit', async () => {
    await expect(
      service.assertSlot(manager as never, 1, 20, 9),
    ).resolves.toBeUndefined();
    manager.countBy.mockResolvedValue(12);
    await expect(
      service.assertSlot(manager as never, 1, 20, 9),
    ).rejects.toThrow('не более 12 игроков');
  });

  it('adds conflict details to the pending list before confirmation', async () => {
    const result = await service.transfers(1, actor);
    expect(result[0]).toMatchObject({
      shirtNumber: 7,
      numberConflict: { playerId: 30, name: 'Иванов Иван Иванович' },
    });
    expect(players.find).toHaveBeenCalledWith({
      where: [{ communityId: 1, teamId: 20, shirtNumber: 7, isActive: true }],
      relations: { player: true },
    });
    expect(access).toHaveBeenCalledWith(1, actor);
  });

  it('does not confuse the same number in another destination team and clears freed numbers', async () => {
    requests.find.mockResolvedValue([
      request,
      { ...request, id: 101, toTeamId: 21 },
    ]);
    let result = await service.transfers(1, actor);
    expect(result[0].numberConflict?.playerId).toBe(30);
    expect(result[1].numberConflict).toBeNull();
    players.find.mockResolvedValue([]);
    result = await service.transfers(1, actor);
    expect(result.every((r) => r.numberConflict === null)).toBe(true);
  });

  it('does not query all squad players for an empty pending list', async () => {
    requests.find.mockResolvedValue([]);
    await expect(service.transfers(1, actor)).resolves.toEqual([]);
    expect(players.find).not.toHaveBeenCalled();
  });

  it('does not expose names without community access', async () => {
    access.mockRejectedValue(new Error('Forbidden'));
    await expect(service.transfers(1, actor)).rejects.toThrow('Forbidden');
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('rechecks the number on approval and leaves the original team and request unchanged', async () => {
    jest.spyOn(service, 'lockCommunity').mockResolvedValue(undefined);
    jest.spyOn(service, 'assertTeam').mockResolvedValue({} as never);
    manager.findOneBy.mockImplementation((entity) =>
      Promise.resolve(
        entity === CommunityTransferRequestEntity ? request : { teamId: 19 },
      ),
    );
    manager.findOne.mockResolvedValue(occupant);
    await expect(
      service.reviewTransfer(1, 100, { decision: 'approve' }, actor),
    ).rejects.toThrow(ConflictException);
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(request.status).toBe('pending');
  });
});
