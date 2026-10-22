import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TournamentApplicationsService } from './tournament-applications.service';
import { DEFAULT_REGISTRATION_POLICY } from './entities/registration.entity';
import { RegistrationPolicyDto, SaveApplicationDto } from './registration.dto';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentLifecycleStatus } from '../tournaments/enums/tournament-lifecycle-status.enum';
import { applicationEditWindow } from './application-edit-window';

describe('Tournament applications safety', () => {
  const service = new TournamentApplicationsService(
    {} as never,
    {} as never,
    {} as never,
  );
  const tournament = (overrides: Partial<TournamentEntity> = {}) =>
    Object.assign(new TournamentEntity(), {
      id: 1,
      registrationRequired: true,
      registrationStatus: 'open',
      registrationPolicy: { ...DEFAULT_REGISTRATION_POLICY },
      lifecycleStatus: TournamentLifecycleStatus.DRAFT,
      ...overrides,
    });
  const assertWritable = (
    t: TournamentEntity,
    app: Parameters<TournamentApplicationsService['assertWritable']>[1],
  ) => service.assertWritable(t, app, applicationEditWindow([]));

  it('allows a draft only while registration is open', () => {
    expect(() => assertWritable(tournament(), null)).not.toThrow();
    expect(() =>
      assertWritable(tournament({ registrationStatus: 'closed' }), null),
    ).toThrow(ConflictException);
  });
  it('does not allow submitted applications to be edited silently', () => {
    expect(() =>
      assertWritable(tournament(), { status: 'submitted' } as never),
    ).toThrow(ConflictException);
  });
  it('supports amendments after registration closes without replacing the approved version', () => {
    expect(() =>
      assertWritable(tournament({ registrationStatus: 'closed' }), {
        approvedRevisionId: 10,
        status: 'approved',
      } as never),
    ).not.toThrow();
  });
  it('honors the amendment policy', () => {
    expect(() =>
      assertWritable(
        tournament({
          registrationPolicy: {
            ...DEFAULT_REGISTRATION_POLICY,
            allowAmendments: false,
          },
        }),
        { approvedRevisionId: 10, status: 'approved' } as never,
      ),
    ).toThrow(ConflictException);
  });
  it('rejects expired applications and completed tournaments', () => {
    expect(() =>
      assertWritable(
        tournament({
          registrationPolicy: {
            ...DEFAULT_REGISTRATION_POLICY,
            deadline: '2000-01-01T00:00:00Z',
          },
        }),
        null,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      assertWritable(
        tournament({ lifecycleStatus: TournamentLifecycleStatus.COMPLETED }),
        null,
      ),
    ).toThrow(ConflictException);
  });
  it('does not enable the new workflow for legacy tournaments implicitly', () => {
    expect(() =>
      assertWritable(tournament({ registrationRequired: false }), null),
    ).toThrow(ConflictException);
  });
  it('separates the initial deadline from amendments to an accepted roster', () => {
    const t = tournament({
      registrationPolicy: {
        ...DEFAULT_REGISTRATION_POLICY,
        deadline: '2000-01-01T00:00:00Z',
      },
    });
    expect(() =>
      assertWritable(t, {
        approvedRevisionId: 10,
        status: 'changes_requested',
      } as never),
    ).not.toThrow();
    expect(() =>
      assertWritable(t, { status: 'changes_requested' } as never),
    ).toThrow('первоначальной');
    const window = applicationEditWindow([]);
    t.registrationPolicy!.deadline = window.serverNow;
    expect(() => service.assertWritable(t, null, window)).toThrow(
      'первоначальной',
    );
  });
  it('blocks all application states from the fourth round, including approved and returned amendments', () => {
    for (const app of [
      null,
      { status: 'draft' },
      { status: 'changes_requested', approvedRevisionId: 10 },
      { status: 'approved', approvedRevisionId: 10 },
    ]) {
      expect(() =>
        service.assertWritable(tournament(), app as never, {
          ...applicationEditWindow([]),
          locked: true,
        }),
      ).toThrow('4-го тура');
    }
  });
  it('returns an explicit legacy marker, not an approved-roster fallback', async () => {
    const manager = {
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue({ registrationRequired: false }),
    };
    const legacyService = new TournamentApplicationsService(
      { manager } as never,
      {} as never,
      {} as never,
    );
    expect(await legacyService.matchRoster(1, 1)).toBeNull();
    expect(manager.findOneByOrFail).toHaveBeenCalledTimes(1);
  });
  it('returns an empty roster when a new tournament has no active accepted team', async () => {
    const manager = {
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue({ registrationRequired: true }),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    const newService = new TournamentApplicationsService(
      { manager } as never,
      {} as never,
      {} as never,
    );
    expect(await newService.matchRoster(1, 1)).toEqual([]);
  });
  it('validates a full snapshot before checking its current affiliations', async () => {
    await expect(
      service.assertValid(
        {} as never,
        tournament(),
        {} as never,
        {
          snapshot: { players: [], representatives: [] },
          policy: DEFAULT_REGISTRATION_POLICY,
        } as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });
  it('rejects duplicate ids, more than 12 players and more than 2 representatives at the HTTP boundary', async () => {
    const valid = {
      playerIds: [1, 2, 3],
      representatives: [{ name: 'Представитель' }],
    };
    expect(
      await validate(plainToInstance(SaveApplicationDto, valid)),
    ).toHaveLength(0);
    for (const body of [
      { ...valid, playerIds: [1, 1] },
      { ...valid, playerIds: Array.from({ length: 13 }, (_, i) => i + 1) },
      { ...valid, representatives: Array(3).fill({ name: 'Человек' }) },
    ])
      expect(
        (await validate(plainToInstance(SaveApplicationDto, body))).length,
      ).toBeGreaterThan(0);
  });
  it('caps configurable policy at the agreed limits', async () => {
    expect(
      await validate(
        plainToInstance(RegistrationPolicyDto, {
          ...DEFAULT_REGISTRATION_POLICY,
          maxPlayers: 13,
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(RegistrationPolicyDto, {
          ...DEFAULT_REGISTRATION_POLICY,
          maxRepresentatives: 3,
        }),
      ),
    ).not.toHaveLength(0);
  });
});
