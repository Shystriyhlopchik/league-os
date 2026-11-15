import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('Case-insensitive login, case-sensitive password', () => {
  const setup = async (modern: boolean, active = true) => {
    const user = {
      id: 9,
      isActive: active,
      passwordHash: await bcrypt.hash('CorrectPassword9', 4),
    };
    const users = { findByEmailOrUsername: jest.fn().mockResolvedValue(user) };
    const accounts = {
      find: jest
        .fn()
        .mockResolvedValue(
          modern ? [{ user, passwordHash: user.passwordHash }] : [],
        ),
    };
    const service = new AuthService(
      users as never,
      {} as never,
      {} as never,
      accounts as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service as never, 'buildAuthResponse' as never)
      .mockResolvedValue({ ok: true } as never);
    return { service, accounts, users };
  };
  it('normalizes local-account lookup using exact case-insensitive equality', async () => {
    const { service, accounts } = await setup(true);
    await expect(
      service.login({ login: '  CAPTAIN ', password: 'CorrectPassword9' }),
    ).resolves.toEqual({ ok: true });
    const raw = accounts.find.mock.calls[0][0].where.login;
    expect(raw.objectLiteralParameters.login).toBe('captain');
    expect(raw.getSql('login')).toContain('LOWER(BTRIM(login))');
  });
  it('never lowercases the password', async () => {
    const { service } = await setup(true);
    await expect(
      service.login({ login: 'Captain', password: 'correctpassword9' }),
    ).rejects.toThrow('Неверный');
  });
  it('blocks inactive accounts in the legacy fallback too', async () => {
    const { service } = await setup(false, false);
    await expect(
      service.login({ login: 'Captain', password: 'CorrectPassword9' }),
    ).rejects.toThrow('Неверный');
  });
  it('refuses ambiguous old local accounts instead of selecting an arbitrary user', async () => {
    const { service, accounts } = await setup(true);
    accounts.find.mockResolvedValue([{}, {}]);
    await expect(
      service.login({ login: 'Captain', password: 'CorrectPassword9' }),
    ).rejects.toThrow('Неоднозначный');
  });
});
