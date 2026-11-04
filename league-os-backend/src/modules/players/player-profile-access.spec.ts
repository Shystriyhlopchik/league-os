import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlayerProfilesController } from './player-profiles.controller';
import {
  PlayerIdentityChangeDto,
  PlayerPhotoDto,
  ReviewPlayerIdentityDto,
} from './player-profile.dto';
import { TeamPlayersService } from '../team-players/team-players.service';
import { PlayerEntity } from './entities/player.entity';

describe('Player profile access boundaries', () => {
  it('protects all profile endpoints with JWT authentication', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PlayerProfilesController),
    ).toContain(JwtAuthGuard);
  });
  it('rejects incomplete identities, invalid team IDs and whitespace-only reasons', async () => {
    const dto = plainToInstance(PlayerIdentityChangeDto, {
      expectedVersion: 0,
      teamId: 0,
      firstName: ' ',
      lastName: '',
      birthDate: 'today',
      middleName: '',
      reason: ' ',
    });
    expect((await validate(dto)).map((e) => e.property)).toEqual(
      expect.arrayContaining([
        'expectedVersion',
        'teamId',
        'firstName',
        'lastName',
        'birthDate',
        'reason',
      ]),
    );
  });
  it('accepts multipart team IDs and requires a photo concurrency token', async () => {
    expect(
      await validate(
        plainToInstance(PlayerPhotoDto, { teamId: '3', expectedPhotoUrl: '' }),
      ),
    ).toHaveLength(0);
    expect(
      (await validate(plainToInstance(PlayerPhotoDto, { teamId: '3' }))).map(
        (e) => e.property,
      ),
    ).toContain('expectedPhotoUrl');
  });
  it('does not accept arbitrary moderation decisions', async () => {
    expect(
      await validate(
        plainToInstance(ReviewPlayerIdentityDto, { decision: 'delete' }),
      ),
    ).not.toHaveLength(0);
  });
  function legacy() {
    const player = {
      id: 5,
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: null,
      birthDate: '2000-01-01',
    };
    const link = { id: 6, player, teamId: 3 };
    const m = {
      findOne: jest.fn().mockResolvedValue(link),
      update: jest.fn(),
      save: jest.fn(),
      findOneOrFail: jest.fn().mockResolvedValue(link),
    };
    const service = Object.create(TeamPlayersService.prototype);
    service.dataSource = { transaction: (fn: any) => fn(m) };
    service.squads = {
      defaultCommunityId: async () => 1,
      lockCommunity: async () => undefined,
      assertCaptainHandover: async () => undefined,
    };
    service.usersService = {
      findById: async () => ({ roles: [{ code: 'super_admin' }] }),
    };
    service.ensureTeamExists = async () => undefined;
    service.ensureCanManageTeam = async () => undefined;
    service.ensureShirtNumberAvailable = async () => undefined;
    return { service, m };
  }
  it('does not let even a platform administrator bypass identity moderation through the legacy team endpoint', async () => {
    const f = legacy();
    await expect(
      f.service.updateForTeam(3, 6, { firstName: 'Пётр' }, 1),
    ).rejects.toThrow('отправьте исправление');
    expect(f.m.save).not.toHaveBeenCalled();
  });
  it('does not allow unaudited photo changes through the legacy endpoint', async () => {
    const f = legacy();
    await expect(
      f.service.updateForTeam(3, 6, {}, 1, { buffer: Buffer.from('photo') }),
    ).rejects.toThrow('Профиль игрока');
  });
  it('keeps editing team attributes, updating no identity or photo fields on the shared entity', async () => {
    const f = legacy();
    await f.service.updateForTeam(
      3,
      6,
      { shirtNumber: 8, isCaptain: false },
      1,
    );
    expect(f.m.update).toHaveBeenCalledWith(PlayerEntity, 5, {
      updatedAt: expect.any(Date),
    });
    expect(f.m.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 6, shirtNumber: 8, isCaptain: false }),
    );
  });
});
