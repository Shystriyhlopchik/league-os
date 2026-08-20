import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesModule } from '../roles/roles.module';
import { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAuthAccountEntity } from './entities/user-auth-account.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetMailerService } from './password-reset-mailer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserAuthAccountEntity,
      PasswordResetTokenEntity,
      PlayerEntity,
      TeamPlayerEntity,
    ]),
    RolesModule,
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.getOrThrow<string>('JWT_SECRET');
        const expiresIn =
          configService.get<StringValue>('JWT_EXPIRES_IN') ?? '7d';

        return {
          secret,
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PasswordResetService,
    PasswordResetMailerService,
  ],
})
export class AuthModule {}
