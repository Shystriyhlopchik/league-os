/* eslint-disable @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-call,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-return */
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PasswordResetService } from './password-reset.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('PasswordResetService', () => {
  const usersService = {
    findByEmail: jest.fn(),
  };
  const tokensRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const mailer = {
    sendPasswordReset: jest.fn(),
  };
  const manager = {
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((callback) => callback(manager)),
  };

  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PasswordResetService(
      usersService as never,
      dataSource as never,
      mailer as never,
      tokensRepository as never,
    );
  });

  it('does not reveal that an email is not registered', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    const result = await service.requestReset({ email: 'missing@example.com' });

    expect(result.message).toContain('Если аккаунт');
    expect(tokensRepository.save).not.toHaveBeenCalled();
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('stores only a token hash and sends the raw token', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 7,
      email: 'user@example.com',
      firstName: 'Иван',
      lastName: 'Иванов',
      isActive: true,
    });
    tokensRepository.findOne.mockResolvedValue(null);
    tokensRepository.update.mockResolvedValue({ affected: 1 });
    tokensRepository.save.mockImplementation((value) =>
      Promise.resolve({
        ...value,
        id: 11,
      }),
    );
    mailer.sendPasswordReset.mockResolvedValue(true);

    await service.requestReset({ email: 'USER@example.com' });

    const savedToken = tokensRepository.save.mock.calls[0][0];
    const sentToken = mailer.sendPasswordReset.mock.calls[0][2];

    expect(sentToken).toHaveLength(64);
    expect(savedToken.tokenHash).toHaveLength(64);
    expect(savedToken.tokenHash).not.toBe(sentToken);
    expect(usersService.findByEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('rejects an expired or already used token', async () => {
    tokensRepository.findOne.mockResolvedValue(null);

    await expect(
      service.resetPassword({
        token: 'a'.repeat(64),
        password: 'new-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates both password hashes and consumes all reset tokens', async () => {
    tokensRepository.findOne.mockResolvedValue({ id: 11, userId: 7 });
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    manager.update.mockResolvedValue({ affected: 1 });

    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const where = jest.fn(() => ({ execute }));
    const set = jest.fn(() => ({ where }));
    const update = jest.fn(() => ({ set }));
    manager.createQueryBuilder.mockReturnValue({ update });

    const result = await service.resetPassword({
      token: 'a'.repeat(64),
      password: 'new-password',
    });

    expect(result).toEqual({ message: 'Пароль успешно изменён' });
    expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 10);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledTimes(3);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'new-hash' }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
