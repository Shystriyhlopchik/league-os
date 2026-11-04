import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as files from 'node:fs/promises';
import {
  PlayerProfilesService,
  playerIdentity,
} from './player-profiles.service';
import { PlayerEntity } from './entities/player.entity';
import {
  PlayerProfileAuditEntity,
  PlayerProfileChangeEntity,
} from './entities/player-profile-change.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('PlayerProfilesService', () => {
  const actor = { id: 10, roles: [] };
  function fixture() {
    const player = {
      id: 5,
      slug: 'ivan',
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: null,
      birthDate: '2000-01-01',
      identityVersion: 1,
      photoUrl: null,
      isActive: true,
    } as unknown as PlayerEntity;
    const before = playerIdentity(player);
    const change = {
      id: 8,
      playerId: 5,
      communityId: 1,
      teamId: 3,
      requestedByUserId: 10,
      baseVersion: 1,
      before,
      after: { ...before, firstName: 'Пётр' },
      reason: 'Опечатка',
      status: 'submitted',
    };
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const m = {
      findOne: jest.fn(async (type: unknown) =>
        type === PlayerEntity
          ? player
          : type === PlayerProfileChangeEntity
            ? change
            : null,
      ),
      exists: jest.fn(async (type: unknown) => type === TeamPlayerEntity),
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn((_type, value) => value),
      save: jest.fn(async (...args: any[]) =>
        args.length === 1 ? args[0] : { id: 8, ...args[1] },
      ),
      find: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
    };
    const db = { manager: m, transaction: jest.fn(async (fn: any) => fn(m)) };
    const communities = {
      assertAccess: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const squads = { assertManage: jest.fn().mockResolvedValue(undefined) };
    const service = new PlayerProfilesService(
      db as never,
      communities as never,
      squads as never,
    );
    const dto = {
      teamId: 3,
      expectedVersion: 1,
      firstName: 'Пётр',
      lastName: 'Иванов',
      middleName: '',
      birthDate: '2000-01-01',
      reason: 'Опечатка',
    };
    return { service, player, change, m, qb, db, communities, squads, dto };
  }
  beforeEach(() => jest.clearAllMocks());

  it('submits an immutable correction without changing the shared player', async () => {
    const f = fixture();
    const result = await f.service.submit(1, 5, f.dto, actor);
    expect(result).toMatchObject({
      status: 'submitted',
      before: { firstName: 'Иван' },
      after: { firstName: 'Пётр', middleName: null },
    });
    expect(f.player.firstName).toBe('Иван');
    expect(f.squads.assertManage).toHaveBeenCalledWith(1, 3, actor, f.m);
    expect(f.m.save).toHaveBeenCalledWith(
      PlayerProfileAuditEntity,
      expect.objectContaining({ action: 'identity_submitted', changeId: 8 }),
    );
  });
  it('rejects a manager without access to the team', async () => {
    const f = fixture();
    f.squads.assertManage.mockRejectedValue(new ForbiddenException());
    await expect(f.service.submit(1, 5, f.dto, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(f.m.save).not.toHaveBeenCalled();
  });
  it('rejects a player outside the current team', async () => {
    const f = fixture();
    f.m.exists.mockResolvedValue(false);
    await expect(f.service.submit(1, 5, f.dto, actor)).rejects.toThrow(
      'отсутствует',
    );
  });
  it('rejects stale forms and a second pending correction', async () => {
    const f = fixture();
    await expect(
      f.service.submit(1, 5, { ...f.dto, expectedVersion: 2 }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    f.m.exists.mockResolvedValue(true);
    await expect(f.service.submit(1, 5, f.dto, actor)).rejects.toThrow(
      'уже на рассмотрении',
    );
  });
  it('rejects an unchanged identity', async () => {
    const f = fixture();
    await expect(
      f.service.submit(1, 5, { ...f.dto, firstName: 'Иван' }, actor),
    ).rejects.toThrow('не изменены');
  });
  it.each([
    '2025-02-29',
    '2026-02-30',
    '2999-01-01',
    '2000-01-01T00:00:00Z',
    'not-a-date',
  ])('rejects invalid, future or timestamp DOB %s', (birthDate) => {
    const f = fixture();
    expect(() => f.service.normalize({ ...f.dto, birthDate })).toThrow(
      BadRequestException,
    );
  });
  it('normalizes spaces and accepts a real leap day', () => {
    const f = fixture();
    expect(
      f.service.normalize({
        ...f.dto,
        firstName: '  Пётр  ',
        middleName: ' Ильич  ',
        birthDate: '2000-02-29',
      }),
    ).toMatchObject({
      firstName: 'Пётр',
      middleName: 'Ильич',
      birthDate: '2000-02-29',
    });
  });
  it('approves a correction with the same identity and version, retaining IDs and history', async () => {
    const f = fixture();
    await f.service.review(1, 8, { decision: 'approve' }, actor);
    expect(f.player).toMatchObject({
      id: 5,
      slug: 'ivan',
      firstName: 'Пётр',
      identityVersion: 2,
    });
    expect(f.change.status).toBe('approved');
    expect(f.communities.assertAccess).toHaveBeenCalledWith(
      1,
      actor,
      false,
      f.m,
    );
    expect(f.m.query).toHaveBeenCalledWith(
      expect.stringContaining('identity_snapshot IS NULL'),
      [5, JSON.stringify(f.change.before)],
    );
    expect(
      f.m.query.mock.calls.some(([sql]) =>
        /DELETE|UPDATE tournament_roster|UPDATE team_players/i.test(sql),
      ),
    ).toBe(false);
    expect(f.m.save).toHaveBeenCalledWith(
      PlayerProfileAuditEntity,
      expect.objectContaining({
        action: 'identity_approved',
        actorUserId: actor.id,
      }),
    );
  });
  it('does not permit repeat reviews', async () => {
    const f = fixture();
    f.change.status = 'approved';
    await expect(
      f.service.review(1, 8, { decision: 'approve' }, actor),
    ).rejects.toThrow('уже рассмотрен');
  });
  it('requires community moderation rights even for a submitted manager request', async () => {
    const f = fixture();
    f.communities.assertAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      f.service.review(1, 8, { decision: 'approve' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.m.save).not.toHaveBeenCalled();
  });
  it('returns with a required comment, retaining the original identity', async () => {
    const f = fixture();
    await expect(
      f.service.review(1, 8, { decision: 'return', comment: ' ' }, actor),
    ).rejects.toThrow('причину возврата');
    const result = await f.service.review(
      1,
      8,
      { decision: 'return', comment: 'Уточните фамилию' },
      actor,
    );
    expect(result).toMatchObject({
      status: 'changes_requested',
      comment: 'Уточните фамилию',
      reviewedByUserId: 10,
    });
    expect(f.player.firstName).toBe('Иван');
  });
  it('rejects approval of a stale player even if the submitted version was correct', async () => {
    const f = fixture();
    f.player.identityVersion = 2;
    await expect(
      f.service.review(1, 8, { decision: 'approve' }, actor),
    ).rejects.toThrow('уже изменены');
    expect(f.m.save).not.toHaveBeenCalled();
  });
  it('detects out-of-band identity changes without a version bump', async () => {
    const f = fixture();
    f.player.lastName = 'Другая';
    await expect(
      f.service.review(1, 8, { decision: 'approve' }, actor),
    ).rejects.toThrow('уже изменены');
  });
  it('compares JSONB identity by value regardless of database key ordering', async () => {
    const f = fixture();
    const before = f.change.before;
    f.change.before = {
      birthDate: before.birthDate,
      middleName: before.middleName,
      lastName: before.lastName,
      firstName: before.firstName,
    };
    await expect(
      f.service.review(1, 8, { decision: 'approve' }, actor),
    ).resolves.toMatchObject({ status: 'approved' });
  });
  it('requires platform review for identities shared across communities', async () => {
    const f = fixture();
    f.qb.getExists.mockResolvedValue(true);
    await expect(
      f.service.review(1, 8, { decision: 'approve' }, actor),
    ).rejects.toThrow('системный администратор');
    await expect(
      f.service.review(
        1,
        8,
        { decision: 'approve' },
        { id: 1, roles: ['super_admin'] },
      ),
    ).resolves.toMatchObject({ status: 'approved' });
  });
  it('requires an eligibility explanation when changing DOB of an admitted player', async () => {
    const f = fixture();
    f.change.after.birthDate = '2001-01-01';
    f.m.query.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT 1 FROM tournament_roster') ? ([{}] as never) : [],
    );
    await expect(
      f.service.review(1, 8, { decision: 'approve' }, actor),
    ).rejects.toThrow('результат проверки допуска');
    await expect(
      f.service.review(
        1,
        8,
        {
          decision: 'approve',
          eligibilityComment: 'Возраст соответствует регламенту',
        },
        actor,
      ),
    ).resolves.toMatchObject({ status: 'approved' });
  });
  it('blocks a possible duplicate until the organizer explains why these are different people', async () => {
    const f = fixture();
    f.qb.getOne.mockResolvedValue({
      id: 90,
      lastName: 'Иванов',
      firstName: 'Пётр',
    } as never);
    await expect(
      f.service.review(1, 8, { decision: 'approve' }, actor),
    ).rejects.toThrow('ID 90');
    expect(f.player.identityVersion).toBe(1);
    await expect(
      f.service.review(
        1,
        8,
        { decision: 'approve', duplicateComment: 'Проверены, разные люди' },
        actor,
      ),
    ).resolves.toMatchObject({ status: 'approved' });
    expect(f.player.id).toBe(5);
  });
  it('rejects invalid photo content and stale photo updates before writing', async () => {
    const f = fixture();
    await expect(
      f.service.photo(1, 5, 3, '', Buffer.from('<svg/>'), actor),
    ).rejects.toThrow('PNG');
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    f.player.photoUrl = '/uploads/new.jpg';
    await expect(f.service.photo(1, 5, 3, '', png, actor)).rejects.toThrow(
      'Фото уже изменено',
    );
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it('saves a photo immediately, independently from pending identity correction', async () => {
    const f = fixture();
    f.m.exists.mockResolvedValue(true);
    const result = await f.service.photo(
      1,
      5,
      3,
      '',
      Buffer.from([255, 216, 255, 1]),
      actor,
    );
    expect(result.photoUrl).toMatch(/^\/uploads\/players\/ivan-.*\.jpg$/);
    expect(f.player.identityVersion).toBe(1);
    expect(f.m.save).toHaveBeenCalledWith(
      PlayerProfileAuditEntity,
      expect.objectContaining({
        action: 'photo_updated',
        before: { photoUrl: null },
      }),
    );
  });
  it('cleans up the new photo if database auditing fails', async () => {
    const f = fixture();
    f.m.save.mockRejectedValueOnce(new Error('database failed'));
    await expect(
      f.service.photo(1, 5, 3, '', Buffer.from([255, 216, 255, 1]), actor),
    ).rejects.toThrow('database failed');
    expect(files.unlink).toHaveBeenCalledWith(expect.stringContaining('ivan-'));
  });
  it('allows organizers to access former team members / free agents without an active team link', async () => {
    const f = fixture();
    await f.service.profile(1, 5, actor);
    expect(f.communities.assertAccess).toHaveBeenCalledWith(
      1,
      actor,
      false,
      f.m,
    );
    expect(f.m.exists).toHaveBeenCalledWith(TeamPlayerEntity, {
      where: { communityId: 1, playerId: 5 },
    });
  });
});
