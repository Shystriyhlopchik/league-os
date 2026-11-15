import { MatchServiceAccessGuard } from './match-service-access.guard';

describe('Match service authorization', () => {
  const setup = (
    roles: string[],
    communityMember = true,
    action = 'start',
    legacy = false,
  ) => {
    const access = { assertAccess: jest.fn() };
    const repo = {
      findOne: jest.fn().mockResolvedValue({
        tournamentId: 2,
        tournament: { season: { competition: { communityId: 1 } } },
      }),
      exists: jest.fn().mockResolvedValue(communityMember),
    };
    const guard = new MatchServiceAccessGuard(
      { getRepository: () => repo } as never,
      access as never,
    );
    const req = {
      method: 'POST',
      route: {
        path: legacy ? '/matches/:matchId/start' : '/matches/:matchId/commands',
      },
      user: { id: 4, roles },
      params: { matchId: '9' },
      body: { action },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as never;
    return { guard, access, context, req };
  };
  it('allows a referee only inside an active community membership', async () => {
    const { guard, access, context } = setup(['referee']);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(access.assertAccess).not.toHaveBeenCalled();
  });
  it('rejects cross-community referees without organizer rights', async () => {
    const { guard, access, context } = setup(['referee'], false);
    access.assertAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(guard.canActivate(context)).rejects.toThrow('Нет права');
  });
  it('requires organizer rights for recovery even for a referee', async () => {
    const { guard, access, context } = setup(['referee'], true, 'recover');
    access.assertAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(guard.canActivate(context)).rejects.toThrow('Нет права');
  });
  it('requires organizer rights for resetting even for a community referee', async () => {
    const { guard, access, context } = setup(['referee'], true, 'reset');
    access.assertAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(guard.canActivate(context)).rejects.toThrow('Нет права');
  });
  it('allows an organizer to reset only after checking tournament edit rights', async () => {
    const { guard, access, context } = setup(['admin'], true, 'reset');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(access.assertAccess).toHaveBeenCalledWith(2, expect.objectContaining({ id: 4 }), expect.anything());
  });
  it.each(['/matches/:matchId/manual-events', '/matches/:matchId/manual-protocol/sign', '/finished-matches/:matchId/events'])(
    'checks tournament access for manual write %s', async (path) => {
      const { guard, access, context, req } = setup(['user']);
      req.route.path = path;
      access.assertAccess.mockRejectedValue(new Error('Forbidden'));
      await expect(guard.canActivate(context)).rejects.toThrow('Нет права');
    },
  );
  it('prevents obsolete endpoints from bypassing idempotent commands', async () => {
    const { guard, context } = setup(['super_admin'], true, 'start', true);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Обновите страницу',
    );
  });
});
