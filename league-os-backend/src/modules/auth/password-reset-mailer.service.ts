import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class PasswordResetMailerService {
  private readonly logger = new Logger(PasswordResetMailerService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');

    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(this.configService.get<string>('SMTP_PORT', '587')),
          secure: this.configService.get<string>('SMTP_SECURE') === 'true',
          auth: this.buildAuth(),
        })
      : null;
  }

  async sendPasswordReset(
    email: string,
    displayName: string,
    token: string,
  ): Promise<boolean> {
    const frontendUrl = this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:4200')
      .replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

    if (!this.transporter) {
      if (this.configService.get<string>('NODE_ENV') !== 'production') {
        this.logger.warn(`Ссылка для сброса пароля (${email}): ${resetUrl}`);
        return true;
      }

      this.logger.error('SMTP не настроен: письмо сброса пароля не отправлено');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.configService.getOrThrow<string>('SMTP_FROM'),
        to: email,
        subject: 'Сброс пароля — Арман Лига',
        text: [
          `Здравствуйте, ${displayName}.`,
          '',
          'Чтобы установить новый пароль, перейдите по ссылке:',
          resetUrl,
          '',
          'Ссылка действует 30 минут. Если вы не запрашивали сброс, проигнорируйте письмо.',
        ].join('\n'),
        html: `
          <p>Здравствуйте, ${this.escapeHtml(displayName)}.</p>
          <p>Чтобы установить новый пароль, перейдите по ссылке:</p>
          <p><a href="${this.escapeHtml(resetUrl)}">Сбросить пароль</a></p>
          <p>Ссылка действует 30 минут. Если вы не запрашивали сброс, проигнорируйте письмо.</p>
        `,
      });

      return true;
    } catch (error) {
      this.logger.error('Не удалось отправить письмо сброса пароля', error);
      return false;
    }
  }

  private buildAuth(): { user: string; pass: string } | undefined {
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    return user && pass ? { user, pass } : undefined;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };

      return entities[character];
    });
  }
}
