import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';

import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { AuthProvider } from './enums/auth-provider.enum';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity';
import { UserAuthAccountEntity } from './entities/user-auth-account.entity';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetMailerService } from './password-reset-mailer.service';

const GENERIC_RESPONSE = {
  message: 'Если аккаунт с таким email существует, письмо уже отправлено',
};
const TOKEN_TTL_MS = 30 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly mailer: PasswordResetMailerService,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly tokensRepository: Repository<PasswordResetTokenEntity>,
  ) {}

  async requestReset(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user?.isActive || !user.email) {
      return GENERIC_RESPONSE;
    }

    const latestToken = await this.tokensRepository.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    if (
      latestToken &&
      Date.now() - latestToken.createdAt.getTime() < REQUEST_COOLDOWN_MS
    ) {
      return GENERIC_RESPONSE;
    }

    const now = new Date();
    await this.tokensRepository.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: now },
    );

    const token = randomBytes(32).toString('hex');
    const resetToken = await this.tokensRepository.save(
      this.tokensRepository.create({
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      }),
    );

    const sent = await this.mailer.sendPasswordReset(
      user.email,
      [user.firstName, user.lastName].filter(Boolean).join(' '),
      token,
    );

    if (!sent) {
      await this.tokensRepository.update(resetToken.id, { usedAt: new Date() });
    }

    return GENERIC_RESPONSE;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const now = new Date();
    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.tokensRepository.findOne({
      where: {
        tokenHash,
        usedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
    });

    if (!resetToken) {
      throw new BadRequestException('Ссылка недействительна или устарела');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.dataSource.transaction(async (manager) => {
      const consumed = await manager.update(
        PasswordResetTokenEntity,
        {
          id: resetToken.id,
          usedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
        { usedAt: new Date() },
      );

      if (consumed.affected !== 1) {
        throw new BadRequestException('Ссылка недействительна или устарела');
      }

      await manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({
          passwordHash,
          authVersion: () => '"authVersion" + 1',
        })
        .where('id = :userId', { userId: resetToken.userId })
        .execute();

      await manager.update(
        UserAuthAccountEntity,
        {
          userId: resetToken.userId,
          provider: AuthProvider.Local,
        },
        { passwordHash },
      );

      await manager.update(
        PasswordResetTokenEntity,
        { userId: resetToken.userId, usedAt: IsNull() },
        { usedAt: new Date() },
      );
    });

    return { message: 'Пароль успешно изменён' };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
