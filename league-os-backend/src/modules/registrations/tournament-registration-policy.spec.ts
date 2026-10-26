import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TournamentApplicationsService } from './tournament-applications.service';
import {
  DEFAULT_REGISTRATION_POLICY,
  ApplicationRevisionEntity,
  TournamentApplicationEntity,
} from './entities/registration.entity';
import { RegistrationPolicyDto } from './registration.dto';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentLifecycleStatus } from '../tournaments/enums/tournament-lifecycle-status.enum';
import { TournamentAccessAction } from '../tournaments/access/tournament-access-action.enum';

describe('Registration settings before tournament launch', () => {
  let service: TournamentApplicationsService;
  let tournament: TournamentEntity;
  let applications: Partial<TournamentApplicationEntity>[];
  let revisions: Partial<ApplicationRevisionEntity>[];
  let manager: { exists: jest.Mock; find: jest.Mock; save: jest.Mock };
  let access: { assertAccess: jest.Mock };
  const actor = { id: 7 };
  const policy = (changes: Partial<RegistrationPolicyDto> = {}) => ({
    ...DEFAULT_REGISTRATION_POLICY,
    ...changes,
  });
  const revision = (id: number, players = 5, representatives = 0) => ({
    id,
    applicationId: 1,
    policy: { ...DEFAULT_REGISTRATION_POLICY },
    snapshot: {
      players: Array.from({ length: players }, (_, i) => ({
        playerId: i + 1,
        teamPlayerId: i + 1,
        name: `Игрок ${i}`,
        shirtNumber: i + 1,
        isCaptain: i === 0,
      })),
      representatives: Array.from({ length: representatives }, (_, i) => ({
        name: `Представитель ${i}`,
      })),
    },
  });
  beforeEach(() => {
    tournament = Object.assign(new TournamentEntity(), {
      id: 5,
      registrationRequired: true,
      registrationStatus: 'open',
      lifecycleStatus: TournamentLifecycleStatus.DRAFT,
      registrationOpenedAt: new Date('2026-01-01T00:00:00Z'),
      registrationPolicy: policy({ allowAmendments: false }),
    });
    applications = [];
    revisions = [];
    manager = {
      exists: jest.fn(async () => false),
      find: jest.fn(async (entity) =>
        entity === TournamentApplicationEntity ? applications : revisions,
      ),
      save: jest.fn(async (value) => value),
    };
    access = { assertAccess: jest.fn(async () => undefined) };
    service = new TournamentApplicationsService(
      { transaction: async (callback) => callback(manager) } as never,
      {} as never,
      access as never,
    );
    jest.spyOn(service, 'lock').mockResolvedValue(tournament);
  });

  it('allows enabling amendments after registration opened and keeps accepted snapshots unchanged', async () => {
    applications = [
      {
        id: 1,
        teamId: 9,
        status: 'approved',
        currentRevisionId: 11,
        approvedRevisionId: 11,
      },
    ];
    revisions = [revision(11)];
    const original = JSON.stringify(revisions);
    const openedAt = tournament.registrationOpenedAt;
    await service.configure(5, policy(), actor);
    expect(tournament.registrationPolicy!.allowAmendments).toBe(true);
    expect(tournament.registrationStatus).toBe('open');
    expect(tournament.registrationOpenedAt).toBe(openedAt);
    expect(JSON.stringify(revisions)).toBe(original);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(access.assertAccess).toHaveBeenCalledWith(
      5,
      actor,
      TournamentAccessAction.PUBLISH,
    );
  });

  it('allows changes after registration closes but before explicit launch', async () => {
    tournament.registrationStatus = 'closed';
    await expect(service.configure(5, policy(), actor)).resolves.toBe(
      tournament,
    );
  });

  it.each([
    TournamentLifecycleStatus.PUBLISHED,
    TournamentLifecycleStatus.IN_PROGRESS,
    TournamentLifecycleStatus.COMPLETED,
  ])('rejects changes after launch: %s', async (status) => {
    tournament.lifecycleStatus = status;
    await expect(service.configure(5, policy(), actor)).rejects.toThrow(
      'до запуска',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('also rejects a draft with actually live or finished matches', async () => {
    manager.exists.mockResolvedValue(true);
    await expect(service.configure(5, policy(), actor)).rejects.toThrow(
      'до запуска',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not implicitly enable registration for legacy tournaments', async () => {
    tournament.registrationRequired = false;
    await expect(service.configure(5, policy(), actor)).rejects.toThrow(
      'до запуска',
    );
  });

  it('requires organizer permissions even before launch', async () => {
    access.assertAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.configure(5, policy(), actor)).rejects.toThrow(
      ForbiddenException,
    );
    expect(manager.find).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each(['approved', 'draft', 'changes_requested'] as const)(
    'protects the accepted roster while the application is %s',
    async (status) => {
      applications = [
        {
          id: 1,
          teamId: 9,
          status,
          currentRevisionId: 12,
          approvedRevisionId: 11,
        },
      ];
      revisions = [revision(11, 12), revision(12, 5)];
      const previous = tournament.registrationPolicy;
      const error = await service
        .configure(5, policy({ maxPlayers: 10, maxMatchPlayers: 10 }), actor)
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: 'REGISTRATION_POLICY_CONFLICT',
        conflicts: [
          expect.objectContaining({
            applicationId: 1,
            teamId: 9,
            revisionId: 11,
          }),
        ],
      });
      expect(tournament.registrationPolicy).toBe(previous);
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('protects a submitted amendment as well as the still active accepted version', async () => {
    applications = [
      {
        id: 1,
        teamId: 9,
        status: 'submitted',
        currentRevisionId: 12,
        approvedRevisionId: 11,
      },
    ];
    revisions = [revision(11, 5), revision(12, 12)];
    const error = await service
      .configure(5, policy({ maxPlayers: 10, maxMatchPlayers: 10 }), actor)
      .catch((e) => e);
    expect(error.getResponse().conflicts).toEqual([
      expect.objectContaining({ revisionId: 12 }),
    ]);
  });

  it.each([
    [{ minPlayers: 6 }, 5, 0],
    [{ maxRepresentatives: 1 }, 5, 2],
  ])(
    'rejects limits that invalidate a submitted roster: %p',
    async (changes, players, representatives) => {
      applications = [
        {
          id: 1,
          teamId: 9,
          status: 'submitted',
          currentRevisionId: 11,
          approvedRevisionId: null,
        },
      ];
      revisions = [revision(11, players, representatives)];
      await expect(
        service.configure(5, policy(changes), actor),
      ).rejects.toThrow('несовместимы');
    },
  );

  it('allows incompatible unaccepted drafts to be corrected instead of blocking all settings', async () => {
    applications = [
      {
        id: 1,
        teamId: 9,
        status: 'draft',
        currentRevisionId: 11,
        approvedRevisionId: null,
      },
    ];
    revisions = [revision(11, 12)];
    await expect(
      service.configure(
        5,
        policy({ maxPlayers: 10, maxMatchPlayers: 10 }),
        actor,
      ),
    ).resolves.toBe(tournament);
  });

  it('fails closed if an accepted snapshot cannot be found', async () => {
    applications = [
      { id: 1, teamId: 9, status: 'approved', approvedRevisionId: 11 },
    ];
    await expect(service.configure(5, policy(), actor)).rejects.toThrow(
      'проверить сохранённые заявки',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('allows an unchanged expired initial deadline when enabling amendments', async () => {
    tournament.registrationPolicy!.deadline = '2000-01-01T00:00:00Z';
    await expect(
      service.configure(
        5,
        policy({ deadline: '2000-01-01T03:00:00+03:00' }),
        actor,
      ),
    ).resolves.toBe(tournament);
  });

  it('rejects a new expired deadline and inconsistent limits', async () => {
    await expect(
      service.configure(5, policy({ deadline: '2000-01-01T00:00:00Z' }), actor),
    ).rejects.toThrow('будущем');
    await expect(
      service.configure(5, policy({ minPlayers: 12, maxPlayers: 5 }), actor),
    ).rejects.toThrow('число игроков');
  });

  it('validates previously saved revisions against current limits, not their historical policy', async () => {
    tournament.registrationPolicy = policy({
      maxPlayers: 10,
      maxMatchPlayers: 10,
    });
    await expect(
      service.assertValid(
        manager as never,
        tournament,
        {} as never,
        revision(11, 12) as never,
      ),
    ).rejects.toThrow('лимитам');
    tournament.registrationPolicy = policy({ minPlayers: 6 });
    await expect(
      service.assertValid(
        manager as never,
        tournament,
        {} as never,
        revision(11, 5) as never,
      ),
    ).rejects.toThrow('лимитам');
  });

  it('does not approve an amendment if current policy prohibits it', async () => {
    await expect(
      service.assertValid(
        manager as never,
        tournament,
        { approvedRevisionId: 10 } as never,
        revision(11) as never,
      ),
    ).rejects.toThrow('запрещены регламентом');
  });

  it('does not reject a valid draft under outdated, stricter snapshot limits', async () => {
    tournament.registrationPolicy = policy();
    const draft = revision(11);
    draft.policy.minPlayers = 6;
    const currentManager = {
      find: jest.fn(async () =>
        draft.snapshot.players.map((p) => ({
          ...p,
          player: { isActive: true },
        })),
      ),
      getRepository: () => ({ findOne: jest.fn(async () => null) }),
    };
    jest.spyOn(service, 'communityId').mockReturnValue(1);
    await expect(
      service.assertValid(
        currentManager as never,
        tournament,
        { teamId: 9 } as never,
        draft as never,
      ),
    ).resolves.toBeUndefined();
    expect(draft.policy.minPlayers).toBe(6);
  });
});
