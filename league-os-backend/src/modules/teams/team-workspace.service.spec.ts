import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TeamWorkspaceService } from './team-workspace.service';
import {
  RequestTeamAccessDto,
  TeamProfileDto,
  TeamProfileVersionDto,
} from './dto/team-workspace.dto';
import { CommunitySquadsService } from '../registrations/community-squads.service';
import { TeamManagerEntity } from './entities/team-management.entity';

describe('Team self-service safeguards', () => {
  const service = new TeamWorkspaceService(
    {} as never,
    {} as never,
    {} as never,
  );
  it('permits an incomplete draft but requires a locality for publication', () => {
    expect(() =>
      service.validateProfile({ name: 'Команда' }, false),
    ).not.toThrow();
    expect(() => service.validateProfile({ name: 'Команда' }, true)).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.validateProfile({ name: 'Команда', village: 'Деревня' }, true),
    ).not.toThrow();
  });
  it('does not require a logo, a playing account or a full squad to publish a valid card', () => {
    expect(() =>
      service.validateProfile({ name: 'Команда', city: 'Чебоксары' }, true),
    ).not.toThrow();
  });
  it('rejects whitespace names and implausible foundation years', () => {
    expect(() => service.validateProfile({ name: '  ' }, false)).toThrow();
    expect(() =>
      service.validateProfile(
        { name: 'Команда', foundedYear: new Date().getFullYear() + 2 },
        false,
      ),
    ).toThrow();
  });
  it('rejects SVG and oversized logos regardless of the filename', () => {
    expect(() => service.logoExtension(Buffer.from('<svg></svg>'))).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.logoExtension(Buffer.alloc(5 * 1024 * 1024 + 1)),
    ).toThrow(BadRequestException);
  });
  it('uses a raster signature instead of a client supplied MIME type', () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    expect(service.logoExtension(png)).toBe('png');
    expect(service.logoExtension(Buffer.from([255, 216, 255, 224]))).toBe(
      'jpg',
    );
  });
  it('accepts partial registration and enforces bounds on descriptive fields', async () => {
    expect(
      await validate(
        plainToInstance(TeamProfileDto, { name: 'Новая команда' }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(TeamProfileDto, { name: '  ' })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(TeamProfileDto, {
          name: 'Команда',
          description: 'x'.repeat(4001),
        }),
      ),
    ).not.toHaveLength(0);
  });
  it('requires optimistic version and a meaningful access request reason', async () => {
    expect(
      await validate(plainToInstance(TeamProfileVersionDto, {})),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(RequestTeamAccessDto, { teamId: 1, reason: '  ' }),
      ),
    ).not.toHaveLength(0);
  });
  it('uses an independent team grant, never a playing captain marker, for ordinary users', async () => {
    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue(false),
    };
    const squads = new CommunitySquadsService(
      { manager } as never,
      {} as never,
    );
    jest.spyOn(squads, 'assertTeam').mockResolvedValue({} as never);
    expect(await squads.canManage(1, 3, { id: 8 })).toBe(false);
    expect(manager.exists).toHaveBeenCalledWith(TeamManagerEntity, {
      where: { communityId: 1, teamId: 3, userId: 8, isActive: true },
    });
    manager.exists.mockResolvedValue(true);
    expect(await squads.canManage(1, 3, { id: 8 })).toBe(true);
  });
  it('blocks excluded community members even when their team grant still exists', async () => {
    const manager = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ isActive: false, role: 'owner' }),
      exists: jest.fn().mockResolvedValue(true),
    };
    const squads = new CommunitySquadsService(
      { manager } as never,
      {} as never,
    );
    jest.spyOn(squads, 'assertTeam').mockResolvedValue({} as never);
    expect(await squads.canManage(1, 3, { id: 8 })).toBe(false);
    expect(manager.exists).not.toHaveBeenCalled();
  });
});
